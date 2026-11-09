import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnswerInput,
  AssessmentInput,
  AssignAssessmentInput,
  MarkAttemptInput,
  QuestionInput,
  UpdateAssessmentInput,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { markAnswer, shuffled } from './marking';

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tests and quizzes. HR (`assessment.manage`) writes questions, publishes, assigns people and
 * marks written answers. People take what is assigned to them: an attempt fixes the question
 * order and, with a time limit, an end time; answers save as they go and choice, number and
 * short answers mark themselves on submit. Managers see their team's results. Right answers
 * never leave the server until results are shown.
 */
@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  private get manage() {
    return this.access.can('assessment.manage');
  }

  // ---------- HR: writing and running assessments ----------

  async list() {
    const rows = await this.prisma.db.assessment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, assignments: true } },
        attempts: {
          where: { status: { not: 'IN_PROGRESS' } },
          select: { employeeId: true, passed: true, status: true },
        },
      },
    });
    return rows.map(({ attempts, _count, ...a }) => {
      const done = new Set(attempts.map((t) => t.employeeId));
      const passed = new Set(attempts.filter((t) => t.passed).map((t) => t.employeeId));
      return {
        ...a,
        questions: _count.questions,
        assigned: _count.assignments,
        completed: done.size,
        passed: passed.size,
        toMark: attempts.filter((t) => t.status === 'SUBMITTED').length,
      };
    });
  }

  async create(input: AssessmentInput) {
    await this.assertCourse(input.courseId);
    const a = await this.prisma.db.assessment.create({
      data: { ...input, tenantId: requireTenantId(), createdById: currentContext().userId ?? null },
    });
    await this.audit.record('assessment.created', 'Assessment', a.id, { title: a.title });
    return a;
  }

  private async assertCourse(courseId?: string | null) {
    if (courseId && !(await this.prisma.db.course.findUnique({ where: { id: courseId } })))
      throw new BadRequestException('That course doesn’t exist');
  }

  private async find(id: string) {
    const a = await this.prisma.db.assessment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  /** The full assessment with right answers, for HR. */
  async get(id: string) {
    const a = await this.prisma.db.assessment.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        course: { select: { id: true, title: true } },
      },
    });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  async update(id: string, input: UpdateAssessmentInput) {
    const a = await this.find(id);
    const opensAt = input.opensAt === undefined ? a.opensAt : input.opensAt;
    const closesAt = input.closesAt === undefined ? a.closesAt : input.closesAt;
    if (opensAt && closesAt && closesAt <= opensAt)
      throw new BadRequestException('Closing time must be after opening time');
    await this.assertCourse(input.courseId);
    const row = await this.prisma.db.assessment.update({ where: { id }, data: input });
    await this.audit.record('assessment.updated', 'Assessment', id, { fields: Object.keys(input) });
    return row;
  }

  /** Replaces every question. Locked once anyone has started, so marks stay comparable. */
  async setQuestions(id: string, questions: QuestionInput[]) {
    await this.find(id);
    if (await this.prisma.db.assessmentAttempt.count({ where: { assessmentId: id } }))
      throw new ConflictException(
        'People have already started this, so its questions can’t change. Copy it to make a new version.',
      );
    const tenantId = requireTenantId();
    await this.prisma.db.$transaction([
      this.prisma.db.assessmentQuestion.deleteMany({ where: { assessmentId: id } }),
      this.prisma.db.assessmentQuestion.createMany({
        data: questions.map((q, order) => ({
          tenantId,
          assessmentId: id,
          order,
          kind: q.kind,
          prompt: q.prompt,
          options: q.options as Prisma.InputJsonValue,
          answer: (q.answer ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          points: q.points,
          explanation: q.explanation,
        })),
      }),
    ]);
    return this.get(id);
  }

  async publish(id: string) {
    const a = await this.find(id);
    if (a.status !== 'DRAFT') throw new ConflictException('Already published');
    if (!(await this.prisma.db.assessmentQuestion.count({ where: { assessmentId: id } })))
      throw new BadRequestException('Add at least one question first');
    const row = await this.prisma.db.assessment.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
    await this.audit.record('assessment.published', 'Assessment', id, { title: a.title });
    return row;
  }

  /** Stops new attempts. Anyone mid-way is submitted as they are. */
  async close(id: string) {
    const a = await this.find(id);
    const open = await this.prisma.db.assessmentAttempt.findMany({
      where: { assessmentId: id, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    for (const t of open) await this.finish(t.id);
    const row = await this.prisma.db.assessment.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
    await this.audit.record('assessment.closed', 'Assessment', id, { title: a.title });
    return row;
  }

  async remove(id: string) {
    const a = await this.find(id);
    if (await this.prisma.db.assessmentAttempt.count({ where: { assessmentId: id } }))
      throw new ConflictException('People have taken this, so it can only be closed, not deleted');
    await this.prisma.db.assessment.delete({ where: { id } });
    await this.audit.record('assessment.deleted', 'Assessment', id, { title: a.title });
  }

  /** A fresh draft with the same settings and questions. */
  async copy(id: string) {
    const a = await this.get(id);
    const {
      id: _i,
      tenantId,
      createdAt: _c,
      updatedAt: _u,
      questions,
      course: _co,
      status: _s,
      createdById: _b,
      ...settings
    } = a;
    const copy = await this.prisma.db.assessment.create({
      data: {
        ...settings,
        tenantId,
        title: `${a.title} (copy)`,
        createdById: currentContext().userId ?? null,
        questions: {
          create: questions.map(
            ({ id: _q, assessmentId: _a, tenantId: t, options, answer, ...q }) => ({
              ...q,
              tenantId: t,
              options: options as Prisma.InputJsonValue,
              answer: (answer ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            }),
          ),
        },
      },
    });
    return copy;
  }

  async assign(id: string, input: AssignAssessmentInput) {
    const a = await this.find(id);
    if (a.status === 'CLOSED') throw new ConflictException('This assessment is closed');
    const people = await this.prisma.db.employee.findMany({
      where: {
        status: { not: 'EXITED' },
        ...(input.everyone
          ? {}
          : {
              OR: [
                ...(input.employeeIds.length ? [{ id: { in: input.employeeIds } }] : []),
                ...(input.departmentId ? [{ departmentId: input.departmentId }] : []),
              ],
            }),
      },
      select: { id: true },
    });
    if (input.employeeIds.some((e) => !people.find((p) => p.id === e)))
      throw new BadRequestException('Some of those people aren’t in this workspace');
    const res = await this.prisma.db.assessmentAssignment.createMany({
      data: people.map((p) => ({
        tenantId: requireTenantId(),
        assessmentId: id,
        employeeId: p.id,
        dueAt: input.dueAt ?? null,
      })),
      skipDuplicates: true,
    });
    await this.audit.record('assessment.assigned', 'Assessment', id, {
      title: a.title,
      people: res.count,
    });
    return { assigned: res.count, alreadyAssigned: people.length - res.count };
  }

  async unassign(id: string, employeeId: string) {
    await this.prisma.db.assessmentAssignment.deleteMany({
      where: { assessmentId: id, employeeId },
    });
  }

  /** Everyone assigned, with their best attempt. Managers get just their team. */
  async results(id: string) {
    const a = await this.find(id);
    let scope: string[] | null = null;
    if (!this.manage) {
      const self = await this.access.selfEmployeeId();
      if (!self || !this.access.can('team.read'))
        throw new ForbiddenException('You can’t see these results');
      scope = await this.access.reportingLine(self);
    }
    const [assignments, attempts] = await Promise.all([
      this.prisma.db.assessmentAssignment.findMany({
        where: { assessmentId: id, ...(scope ? { employeeId: { in: scope } } : {}) },
        include: { employee: person },
      }),
      this.prisma.db.assessmentAttempt.findMany({
        where: { assessmentId: id, ...(scope ? { employeeId: { in: scope } } : {}) },
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          employeeId: true,
          status: true,
          percent: true,
          passed: true,
          startedAt: true,
          submittedAt: true,
        },
      }),
    ]);
    const rows = assignments.map((s) => {
      const mine = attempts.filter((t) => t.employeeId === s.employeeId);
      const done = mine.filter((t) => t.status !== 'IN_PROGRESS');
      const best =
        [...done].sort((x, y) => Number(y.percent ?? -1) - Number(x.percent ?? -1))[0] ?? null;
      return {
        employee: s.employee,
        dueAt: s.dueAt,
        attempts: mine.length,
        state: best
          ? best.status === 'SUBMITTED'
            ? 'TO_MARK'
            : best.passed
              ? 'PASSED'
              : 'FAILED'
          : mine.length
            ? 'IN_PROGRESS'
            : s.dueAt && s.dueAt < new Date()
              ? 'OVERDUE'
              : 'NOT_STARTED',
        best: best && { id: best.id, percent: best.percent, submittedAt: best.submittedAt },
        attemptIds: mine.map((t) => t.id),
      };
    });
    const scored = rows.filter((r) => r.best?.percent != null);
    return {
      assessment: { id: a.id, title: a.title, passPercent: a.passPercent, status: a.status },
      summary: {
        assigned: rows.length,
        completed: rows.filter((r) => r.best).length,
        passed: rows.filter((r) => r.state === 'PASSED').length,
        toMark: rows.filter((r) => r.state === 'TO_MARK').length,
        average: scored.length
          ? round2(scored.reduce((n, r) => n + Number(r.best!.percent), 0) / scored.length)
          : null,
      },
      rows,
    };
  }

  // ---------- taking an assessment ----------

  /** What I've been asked to take, and how I did. */
  async mine() {
    const self = await this.access.selfEmployeeId();
    if (!self) return [];
    const rows = await this.prisma.db.assessmentAssignment.findMany({
      where: { employeeId: self, assessment: { status: { not: 'DRAFT' } } },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            description: true,
            purpose: true,
            status: true,
            timeLimitMinutes: true,
            passPercent: true,
            maxAttempts: true,
            opensAt: true,
            closesAt: true,
            showResults: true,
            _count: { select: { questions: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const attempts = await this.prisma.db.assessmentAttempt.findMany({
      where: { employeeId: self, assessmentId: { in: rows.map((r) => r.assessmentId) } },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(
      rows.map(async ({ assessment: { _count, ...a }, dueAt }) => {
        const mine = attempts.filter((t) => t.assessmentId === a.id);
        const live = mine.find((t) => t.status === 'IN_PROGRESS');
        if (live && live.expiresAt && live.expiresAt <= new Date()) await this.finish(live.id);
        return {
          ...a,
          questions: _count.questions,
          dueAt,
          attemptsUsed: mine.length,
          inProgress: live && !(live.expiresAt && live.expiresAt <= new Date()) ? live.id : null,
          attempts: mine.map((t) => ({
            id: t.id,
            status: t.status,
            submittedAt: t.submittedAt,
            ...this.visibleScore(a, t),
          })),
          canStart: this.startProblem(a, mine.length) === null && !live,
        };
      }),
    );
  }

  private startProblem(
    a: { status: string; opensAt: Date | null; closesAt: Date | null; maxAttempts: number },
    used: number,
  ) {
    const now = new Date();
    if (a.status !== 'PUBLISHED') return 'This assessment isn’t open';
    if (a.opensAt && a.opensAt > now) return 'This assessment hasn’t opened yet';
    if (a.closesAt && a.closesAt <= now) return 'This assessment has closed';
    if (used >= a.maxAttempts) return 'You’ve used all your attempts';
    return null;
  }

  /** Scores are shown only when the assessment allows it, and never before marking. */
  private visibleScore(
    a: { showResults: string; status: string },
    t: { status: string; percent: Prisma.Decimal | null; passed: boolean | null },
  ) {
    const show =
      t.status === 'MARKED' &&
      (a.showResults === 'AFTER_SUBMIT' ||
        (a.showResults === 'AFTER_CLOSE' && a.status === 'CLOSED'));
    return show ? { percent: t.percent, passed: t.passed } : { percent: null, passed: null };
  }

  async start(id: string) {
    const self = await this.access.selfEmployeeId();
    if (!self) throw new ForbiddenException('Only employees can take assessments');
    const a = await this.find(id);
    if (
      !(await this.prisma.db.assessmentAssignment.findUnique({
        where: { assessmentId_employeeId: { assessmentId: id, employeeId: self } },
      }))
    )
      throw new ForbiddenException('This assessment isn’t assigned to you');
    const mine = await this.prisma.db.assessmentAttempt.findMany({
      where: { assessmentId: id, employeeId: self },
    });
    const live = mine.find((t) => t.status === 'IN_PROGRESS');
    if (live) {
      if (!live.expiresAt || live.expiresAt > new Date()) return this.attempt(live.id);
      await this.finish(live.id);
    }
    const problem = this.startProblem(a, mine.length);
    if (problem) throw new ConflictException(problem);
    const questions = await this.prisma.db.assessmentQuestion.findMany({
      where: { assessmentId: id },
      orderBy: { order: 'asc' },
      select: { id: true, points: true },
    });
    const now = Date.now();
    const limit = a.timeLimitMinutes ? now + a.timeLimitMinutes * 60_000 : null;
    // A time limit never runs past the closing time.
    const ends = [limit, a.closesAt?.getTime() ?? null].filter((x): x is number => x !== null);
    const t = await this.prisma.db.assessmentAttempt.create({
      data: {
        tenantId: requireTenantId(),
        assessmentId: id,
        employeeId: self,
        questionOrder: (a.shuffle ? shuffled(questions) : questions).map((q) => q.id),
        maxScore: questions.reduce((n, q) => n + q.points, 0),
        expiresAt: ends.length ? new Date(Math.min(...ends)) : null,
      },
    });
    return this.attempt(t.id);
  }

  /** Mine, my team's (managers) or anyone's (HR). Right answers only once it's marked and shown. */
  async attempt(id: string) {
    // Time ran out while nobody was looking: submit what's there before showing it.
    const due = await this.prisma.db.assessmentAttempt.findFirst({
      where: { id, status: 'IN_PROGRESS', expiresAt: { lte: new Date() } },
      select: { id: true },
    });
    if (due) await this.finish(due.id);
    const t = await this.prisma.db.assessmentAttempt.findUnique({
      where: { id },
      include: {
        assessment: true,
        responses: true,
        employee: person,
      },
    });
    if (!t) throw new NotFoundException('Attempt not found');
    const self = await this.access.selfEmployeeId();
    const own = t.employeeId === self;
    const reviewer =
      this.manage ||
      (!own &&
        self &&
        this.access.can('team.read') &&
        (await this.access.reportingLine(self)).includes(t.employeeId));
    if (!own && !reviewer) throw new NotFoundException('Attempt not found');

    const questions = await this.prisma.db.assessmentQuestion.findMany({
      where: { assessmentId: t.assessmentId },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const score =
      own && !this.manage
        ? this.visibleScore(t.assessment, t)
        : { percent: t.percent, passed: t.passed };
    const reveal = Boolean(reviewer) || score.percent !== null;
    const { assessment: a } = t;
    return {
      id: t.id,
      status: t.status,
      startedAt: t.startedAt,
      expiresAt: t.expiresAt,
      submittedAt: t.submittedAt,
      employee: t.employee,
      assessment: {
        id: a.id,
        title: a.title,
        description: a.description,
        passPercent: a.passPercent,
        timeLimitMinutes: a.timeLimitMinutes,
      },
      maxScore: t.maxScore,
      score: reveal ? t.score : null,
      ...score,
      questions: t.questionOrder
        .map((qid) => byId.get(qid))
        .filter((q): q is NonNullable<typeof q> => Boolean(q))
        .map((q) => {
          const r = t.responses.find((x) => x.questionId === q.id);
          return {
            id: q.id,
            kind: q.kind,
            prompt: q.prompt,
            options: q.options,
            points: q.points,
            given: r?.answer ?? null,
            ...(reveal
              ? {
                  answer: q.answer,
                  explanation: q.explanation,
                  awarded: r?.points ?? null,
                  feedback: r?.feedback ?? '',
                  needsMarking: t.status === 'SUBMITTED' && r?.points == null,
                }
              : {}),
          };
        }),
    };
  }

  private async ownLive(id: string) {
    const t = await this.prisma.db.assessmentAttempt.findUnique({ where: { id } });
    if (!t || t.employeeId !== (await this.access.selfEmployeeId()))
      throw new NotFoundException('Attempt not found');
    if (t.status !== 'IN_PROGRESS')
      throw new ConflictException('This attempt is already submitted');
    if (t.expiresAt && t.expiresAt <= new Date()) {
      await this.finish(t.id);
      throw new ConflictException('Time is up. Your answers so far were submitted.');
    }
    return t;
  }

  async answer(id: string, input: AnswerInput) {
    const t = await this.ownLive(id);
    if (!t.questionOrder.includes(input.questionId))
      throw new BadRequestException('That question isn’t in this assessment');
    await this.prisma.db.assessmentResponse.upsert({
      where: { attemptId_questionId: { attemptId: id, questionId: input.questionId } },
      create: {
        tenantId: t.tenantId,
        attemptId: id,
        questionId: input.questionId,
        answer: input.answer,
      },
      update: { answer: input.answer },
    });
    return { saved: true };
  }

  async submit(id: string) {
    await this.ownLive(id);
    await this.finish(id);
    return this.attempt(id);
  }

  /** Closes an attempt: marks what can be marked and totals it if nothing is left for a person. */
  private async finish(id: string) {
    const t = await this.prisma.db.assessmentAttempt.findUniqueOrThrow({
      where: { id },
      include: { responses: true, assessment: { select: { passPercent: true, title: true } } },
    });
    if (t.status !== 'IN_PROGRESS') return;
    const questions = await this.prisma.db.assessmentQuestion.findMany({
      where: { id: { in: t.questionOrder } },
    });
    let manual = false;
    for (const q of questions) {
      const r = t.responses.find((x) => x.questionId === q.id);
      const pts = markAnswer({ kind: q.kind, answer: q.answer, points: q.points }, r?.answer);
      if (pts === null) manual = true;
      await this.prisma.db.assessmentResponse.upsert({
        where: { attemptId_questionId: { attemptId: id, questionId: q.id } },
        create: {
          tenantId: t.tenantId,
          attemptId: id,
          questionId: q.id,
          answer: (r?.answer ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          points: pts,
          autoMarked: pts !== null,
        },
        update: { points: pts, autoMarked: pts !== null },
      });
    }
    await this.prisma.db.assessmentAttempt.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    if (!manual) await this.total(id);
  }

  /** Adds up the points once every answer has some, and decides pass or fail. */
  private async total(id: string) {
    const t = await this.prisma.db.assessmentAttempt.findUniqueOrThrow({
      where: { id },
      include: { responses: true, assessment: { select: { passPercent: true, title: true } } },
    });
    const score = t.responses.reduce((n, r) => n + Number(r.points ?? 0), 0);
    const percent = t.maxScore ? round2((score / t.maxScore) * 100) : 0;
    await this.prisma.db.assessmentAttempt.update({
      where: { id },
      data: { status: 'MARKED', score, percent, passed: percent >= t.assessment.passPercent },
    });
    await this.audit.record('assessment.completed', 'AssessmentAttempt', id, {
      employeeId: t.employeeId,
      assessment: t.assessment.title,
    });
  }

  /** HR marks written answers (and can change any automatic mark). */
  async mark(id: string, input: MarkAttemptInput) {
    if (!this.manage) throw new ForbiddenException('You can’t mark assessments');
    const t = await this.prisma.db.assessmentAttempt.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Attempt not found');
    if (t.status === 'IN_PROGRESS')
      throw new ConflictException('This attempt hasn’t been submitted yet');
    const questions = await this.prisma.db.assessmentQuestion.findMany({
      where: { id: { in: t.questionOrder } },
    });
    for (const m of input.marks) {
      const q = questions.find((x) => x.id === m.questionId);
      if (!q) throw new BadRequestException('That question isn’t in this attempt');
      if (m.points > q.points)
        throw new BadRequestException(`That question is worth at most ${q.points}`);
      await this.prisma.db.assessmentResponse.upsert({
        where: { attemptId_questionId: { attemptId: id, questionId: q.id } },
        create: {
          tenantId: t.tenantId,
          attemptId: id,
          questionId: q.id,
          answer: Prisma.JsonNull,
          points: m.points,
          feedback: m.feedback,
        },
        update: { points: m.points, feedback: m.feedback, autoMarked: false },
      });
    }
    const left = await this.prisma.db.assessmentResponse.count({
      where: { attemptId: id, points: null },
    });
    await this.prisma.db.assessmentAttempt.update({
      where: { id },
      data: { markedById: currentContext().userId ?? null, markedAt: new Date() },
    });
    if (!left) {
      await this.prisma.db.assessmentAttempt.update({
        where: { id },
        data: { status: 'SUBMITTED' },
      });
      await this.total(id);
    }
    return this.attempt(id);
  }
}
