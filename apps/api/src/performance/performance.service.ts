import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GoalInput,
  KudosInput,
  ReviewCycleInput,
  ReviewInput,
  UpdateGoalInput,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { todayIst } from '../attendance/days';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

interface Viewer {
  manage: boolean;
  self: string | null;
  team: Set<string>;
}

/**
 * Goals, review cycles and kudos.
 *
 * - Company goals are visible to everyone; team and personal goals to their owner, the owner's
 *   managers and `performance.manage`. Owners, their managers and HR update progress.
 * - A review cycle gives every active employee a review: they write a self review, their
 *   manager (at the start of the cycle) writes theirs, HR calibrates the final rating and
 *   shares it. People see their own review once it's shared.
 * - Anyone can thank a colleague with kudos.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  private async viewer(): Promise<Viewer> {
    const self = await this.access.selfEmployeeId();
    const team =
      self && this.access.can('team.read')
        ? new Set(await this.access.reportingLine(self))
        : new Set<string>();
    return { manage: this.access.can('performance.manage'), self, team };
  }

  private canTouch(v: Viewer, ownerId: string) {
    return v.manage || v.self === ownerId || v.team.has(ownerId);
  }

  // ---------- goals ----------

  async goals(scope?: string, ownerId?: string) {
    const v = await this.viewer();
    const where: Prisma.GoalWhereInput = {
      ...(scope ? { scope: scope as Prisma.EnumGoalScopeFilter['equals'] } : {}),
      ...(ownerId ? { ownerId } : {}),
    };
    if (!v.manage)
      where.OR = [
        { scope: 'COMPANY' },
        { ownerId: { in: [...v.team, ...(v.self ? [v.self] : [])] } },
      ];
    const rows = await this.prisma.db.goal.findMany({
      where,
      include: { owner: person },
      orderBy: [{ scope: 'asc' }, { dueDate: 'asc' }],
      take: 300,
    });
    return rows.map(({ dueDate, ...g }) => ({
      ...g,
      dueDate: isoDay(dueDate),
      canEdit: this.canTouch(v, g.ownerId),
    }));
  }

  async createGoal(input: GoalInput) {
    const v = await this.viewer();
    const ownerId = input.ownerId ?? v.self;
    if (!ownerId) throw new BadRequestException('Choose who owns this goal');
    if (!this.canTouch(v, ownerId))
      throw new ForbiddenException('You can set goals for yourself and your team');
    if (input.scope === 'COMPANY' && !v.manage)
      throw new ForbiddenException('Only HR sets company goals');
    const owner = await this.prisma.db.employee.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException('Employee not found');
    const goal = await this.prisma.db.goal.create({
      data: {
        tenantId: requireTenantId(),
        ownerId,
        title: input.title,
        description: input.description ?? null,
        scope: input.scope,
        dueDate: day(input.dueDate),
        progress: input.progress,
        status: input.progress >= 100 ? 'DONE' : input.status,
        createdById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('performance.goal_created', 'Goal', goal.id, { employeeId: ownerId });
    return goal;
  }

  async updateGoal(id: string, input: UpdateGoalInput) {
    const v = await this.viewer();
    const goal = await this.prisma.db.goal.findUnique({ where: { id } });
    if (!goal || !(goal.scope === 'COMPANY' || this.canTouch(v, goal.ownerId)))
      throw new NotFoundException('Goal not found');
    if (!this.canTouch(v, goal.ownerId)) throw new ForbiddenException('You can’t change this goal');
    if (input.scope === 'COMPANY' && !v.manage)
      throw new ForbiddenException('Only HR sets company goals');
    if (input.ownerId && !this.canTouch(v, input.ownerId))
      throw new ForbiddenException('You can’t give this goal to them');
    const { dueDate, ...rest } = input;
    const progress = input.progress ?? goal.progress;
    const updated = await this.prisma.db.goal.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: day(dueDate) } : {}),
        ...(progress >= 100 && !input.status ? { status: 'DONE' } : {}),
      },
    });
    await this.audit.record('performance.goal_updated', 'Goal', id, {
      employeeId: goal.ownerId,
      progress,
    });
    return updated;
  }

  async deleteGoal(id: string) {
    const v = await this.viewer();
    const goal = await this.prisma.db.goal.findUnique({ where: { id } });
    if (!goal || !this.canTouch(v, goal.ownerId)) throw new NotFoundException('Goal not found');
    await this.prisma.db.goal.delete({ where: { id } });
    await this.audit.record('performance.goal_deleted', 'Goal', id, { employeeId: goal.ownerId });
  }

  // ---------- review cycles ----------

  async cycles() {
    return this.prisma.db.reviewCycle.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  }

  async startCycle(input: ReviewCycleInput) {
    if (input.closesOn <= todayIst())
      throw new BadRequestException('Choose a closing date in the future');
    const employees = await this.prisma.db.employee.findMany({
      where: { status: { in: ['ACTIVE', 'ON_NOTICE', 'ONBOARDING'] } },
      select: { id: true, managerId: true },
    });
    const tenantId = requireTenantId();
    const cycle = await this.prisma
      .$transaction(async (tx) => {
        const c = await tx.reviewCycle.create({
          data: { tenantId, name: input.name, closesOn: day(input.closesOn) },
        });
        await tx.review.createMany({
          data: employees.map((e) => ({
            tenantId,
            cycleId: c.id,
            employeeId: e.id,
            reviewerId: e.managerId,
          })),
        });
        return c;
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
          throw new ConflictException('A review cycle is already running, or that name is taken');
        throw err;
      });
    await this.audit.record('performance.cycle_started', 'ReviewCycle', cycle.id, {
      name: input.name,
      people: employees.length,
    });
    return cycle;
  }

  async closeCycle(id: string) {
    const cycle = await this.prisma.db.reviewCycle.findUnique({ where: { id } });
    if (!cycle || !cycle.active) throw new NotFoundException('Review cycle not found');
    await this.prisma.db.reviewCycle.update({
      where: { id },
      data: { active: false, closedAt: new Date() },
    });
    await this.audit.record('performance.cycle_closed', 'ReviewCycle', id, {});
    return { ok: true };
  }

  /** Reviews the caller can see in the active (or a given) cycle, with what they can do next. */
  async reviews(cycleId?: string) {
    const v = await this.viewer();
    const cycle = cycleId
      ? await this.prisma.db.reviewCycle.findUnique({ where: { id: cycleId } })
      : await this.prisma.db.reviewCycle.findFirst({ where: { active: true } });
    if (!cycle) return { cycle: null, reviews: [], counts: null };
    const where: Prisma.ReviewWhereInput = { cycleId: cycle.id };
    if (!v.manage)
      where.OR = [
        ...(v.self ? [{ employeeId: v.self }, { reviewerId: v.self }] : []),
        { employeeId: { in: [...v.team] } },
      ];
    const rows = await this.prisma.db.review.findMany({
      where,
      include: { employee: person, reviewer: person },
      orderBy: { employee: { firstName: 'asc' } },
    });
    const all = await this.prisma.db.review.groupBy({
      by: ['stage'],
      where: { cycleId: cycle.id },
      _count: true,
    });
    const count = (s: string) => all.find((x) => x.stage === s)?._count ?? 0;
    const total = all.reduce((n, x) => n + x._count, 0);
    return {
      cycle: { ...cycle, closesOn: isoDay(cycle.closesOn) },
      counts: {
        total,
        selfDone: total - count('SELF'),
        managerDone: count('CALIBRATION') + count('SHARED'),
        calibrated: count('SHARED'),
        shared: count('SHARED'),
      },
      reviews: rows.map((r) => this.presentReview(r, v)),
    };
  }

  async writeSelf(id: string, input: ReviewInput) {
    const v = await this.viewer();
    const r = await this.prisma.db.review.findUnique({ where: { id }, include: { cycle: true } });
    if (!r || r.employeeId !== v.self) throw new NotFoundException('Review not found');
    this.assertOpen(r.cycle);
    if (r.stage !== 'SELF' && r.stage !== 'MANAGER')
      throw new BadRequestException('Your manager has already reviewed you');
    await this.prisma.db.review.update({
      where: { id },
      data: {
        selfRating: input.rating,
        selfComments: input.comments,
        stage: r.stage === 'SELF' ? 'MANAGER' : r.stage,
      },
    });
    await this.audit.record('performance.self_review', 'Review', id, { employeeId: r.employeeId });
    return this.one(id);
  }

  async writeManager(id: string, input: ReviewInput) {
    const v = await this.viewer();
    const r = await this.prisma.db.review.findUnique({ where: { id }, include: { cycle: true } });
    if (!r) throw new NotFoundException('Review not found');
    const isReviewer =
      !!v.self &&
      (r.reviewerId === v.self || (!r.reviewerId && v.manage) || v.team.has(r.employeeId));
    if (r.employeeId === v.self || !(isReviewer || v.manage))
      throw new NotFoundException('Review not found');
    this.assertOpen(r.cycle);
    if (r.stage === 'SHARED') throw new BadRequestException('This review has been shared already');
    await this.prisma.db.review.update({
      where: { id },
      data: {
        managerRating: input.rating,
        managerComments: input.comments,
        stage: 'CALIBRATION',
        ...(r.reviewerId ? {} : { reviewerId: v.self }),
      },
    });
    await this.audit.record('performance.manager_review', 'Review', id, {
      employeeId: r.employeeId,
    });
    return this.one(id);
  }

  /** HR settles the final rating and shares the review with the employee. */
  async share(id: string, finalRating: number) {
    const r = await this.prisma.db.review.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Review not found');
    if (r.stage !== 'CALIBRATION')
      throw new BadRequestException('The manager review isn’t written yet');
    await this.prisma.db.review.update({ where: { id }, data: { finalRating, stage: 'SHARED' } });
    await this.audit.record('performance.review_shared', 'Review', id, {
      employeeId: r.employeeId,
    });
    return this.one(id);
  }

  private assertOpen(cycle: { active: boolean }) {
    if (!cycle.active) throw new BadRequestException('This review cycle is closed');
  }

  private async one(id: string) {
    const v = await this.viewer();
    const r = await this.prisma.db.review.findUniqueOrThrow({
      where: { id },
      include: { employee: person, reviewer: person },
    });
    return this.presentReview(r, v);
  }

  private presentReview(
    r: Prisma.ReviewGetPayload<{ include: { employee: typeof person; reviewer: typeof person } }>,
    v: Viewer,
  ) {
    const own = r.employeeId === v.self;
    const isReviewer = r.reviewerId === v.self || v.team.has(r.employeeId);
    // The employee sees the manager's words and the final rating only once shared.
    const hideManager = own && !v.manage && r.stage !== 'SHARED';
    return {
      id: r.id,
      cycleId: r.cycleId,
      stage: r.stage,
      employee: r.employee,
      reviewer: r.reviewer,
      selfRating: r.selfRating,
      selfComments: r.selfComments,
      managerRating: hideManager ? null : r.managerRating,
      managerComments: hideManager ? null : r.managerComments,
      finalRating: own && r.stage !== 'SHARED' && !v.manage ? null : r.finalRating,
      canWriteSelf: own && (r.stage === 'SELF' || r.stage === 'MANAGER'),
      canWriteManager: !own && (isReviewer || v.manage) && r.stage !== 'SHARED',
      canShare: v.manage && r.stage === 'CALIBRATION',
    };
  }

  // ---------- kudos ----------

  async giveKudos(input: KudosInput) {
    const v = await this.viewer();
    if (!v.self) throw new BadRequestException('Your login is not linked to an employee record');
    if (input.toId === v.self) throw new BadRequestException('Thank someone else');
    const to = await this.prisma.db.employee.findUnique({
      where: { id: input.toId },
      select: { id: true, status: true },
    });
    if (!to || to.status === 'EXITED') throw new NotFoundException('Employee not found');
    const k = await this.prisma.db.kudos.create({
      data: {
        tenantId: requireTenantId(),
        fromId: v.self,
        toId: input.toId,
        value: input.value,
        reason: input.reason,
      },
    });
    await this.audit.record('performance.kudos', 'Kudos', k.id, { employeeId: input.toId });
    return k;
  }

  async kudos(days = 30) {
    const rows = await this.prisma.db.kudos.findMany({
      where: { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
      include: { from: person, to: person },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const tally = new Map<
      string,
      { employee: (typeof rows)[number]['to']; count: number; latest: string }
    >();
    for (const k of rows) {
      const t = tally.get(k.toId);
      if (t) t.count++;
      else tally.set(k.toId, { employee: k.to, count: 1, latest: k.reason });
    }
    return { recent: rows, top: [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 5) };
  }

  // ---------- summary ----------

  async overview() {
    const v = await this.viewer();
    const goals = await this.goals();
    const counted = goals.filter((g) => g.status !== 'DONE');
    const onTrack = counted.filter((g) => g.status === 'ON_TRACK').length;
    const r = await this.reviews();
    const k = await this.kudos(30);
    return {
      goals: goals.length,
      goalsOnTrackPct: counted.length ? Math.round((onTrack / counted.length) * 100) : null,
      goalsAtRisk: goals.filter((g) => g.status === 'AT_RISK' || g.status === 'BEHIND').length,
      cycle: r.cycle,
      counts: r.counts,
      myReviewTodo: r.reviews.filter(
        (x) => x.canWriteSelf || (x.canWriteManager && x.employee.id !== v.self),
      ).length,
      kudosThisMonth: k.recent.length,
      canManage: v.manage,
      selfEmployeeId: v.self,
    };
  }
}
