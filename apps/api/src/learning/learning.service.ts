import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseInput, CourseSessionInput, UpdateCourseInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { addDays, isoDay, toDate, todayIst } from '../attendance/days';
import { requireTenantId } from '../common/request-context';
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

const courseInclude = {
  lead: person,
  department: { select: { id: true, name: true } },
  enrollments: { select: { id: true, employeeId: true, progress: true } },
} satisfies Prisma.CourseInclude;
type CourseRow = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

interface Viewer {
  manage: boolean;
  self: string | null;
  departmentId: string | null;
  team: Set<string>;
}

export type CourseStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED';

/**
 * Courses the company runs, who is enrolled and how far along they are.
 *
 * - Everyone sees courses open to them: company-wide ones, their department's, ones they lead
 *   and ones they're enrolled in. `learning.manage` sees all of them.
 * - Mandatory courses enrol everyone in the audience when they're created.
 * - People sign up themselves (while there are seats), and update their own progress. The
 *   course lead and HR see every learner; managers see their team's progress.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  private async viewer(): Promise<Viewer> {
    const self = await this.access.selfEmployeeId();
    const me = self
      ? await this.prisma.db.employee.findUnique({
          where: { id: self },
          select: { departmentId: true },
        })
      : null;
    const team =
      self && this.access.can('team.read')
        ? new Set(await this.access.reportingLine(self))
        : new Set<string>();
    return {
      manage: this.access.can('learning.manage'),
      self,
      departmentId: me?.departmentId ?? null,
      team,
    };
  }

  private visibleWhere(v: Viewer): Prisma.CourseWhereInput {
    if (v.manage) return {};
    return {
      OR: [
        { departmentId: null },
        ...(v.departmentId ? [{ departmentId: v.departmentId }] : []),
        ...(v.self ? [{ leadId: v.self }, { enrollments: { some: { employeeId: v.self } } }] : []),
      ],
    };
  }

  private canRun(v: Viewer, c: { leadId: string | null }) {
    return v.manage || (v.self !== null && c.leadId === v.self);
  }

  static status(c: { startsOn: Date; endsOn: Date }, today = todayIst()): CourseStatus {
    if (isoDay(c.startsOn) > today) return 'UPCOMING';
    if (isoDay(c.endsOn) < today) return 'COMPLETED';
    return 'ONGOING';
  }

  private present(c: CourseRow, v: Viewer) {
    const e = c.enrollments;
    const done = e.filter((x) => x.progress >= 100).length;
    const notStarted = e.filter((x) => x.progress === 0).length;
    const mine = v.self ? e.find((x) => x.employeeId === v.self) : undefined;
    const status = LearningService.status(c);
    const full = c.seats !== null && e.length >= c.seats;
    const inAudience =
      c.departmentId === null || (v.departmentId !== null && c.departmentId === v.departmentId);
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      category: c.category,
      lead: c.lead,
      leadId: c.leadId,
      department: c.department,
      mandatory: c.mandatory,
      seats: c.seats,
      startsOn: isoDay(c.startsOn),
      endsOn: isoDay(c.endsOn),
      hours: Number(c.hours),
      mode: c.mode,
      meetingLink: c.meetingLink,
      status,
      registered: e.length,
      done,
      inProgress: e.length - done - notStarted,
      notStarted,
      avg: e.length ? Math.round(e.reduce((n, x) => n + x.progress, 0) / e.length) : 0,
      mine: mine ? { id: mine.id, progress: mine.progress } : null,
      canManage: this.canRun(v, c),
      canEnroll: Boolean(v.self) && !mine && !full && status !== 'COMPLETED' && inAudience,
    };
  }

  private async load(id: string) {
    const c = await this.prisma.db.course.findUnique({ where: { id }, include: courseInclude });
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }

  /** A course the viewer may see, or 404. */
  private async visible(id: string, v: Viewer) {
    const c = await this.prisma.db.course.findFirst({
      where: { id, ...this.visibleWhere(v) },
      include: courseInclude,
    });
    if (!c) throw new NotFoundException('Course not found');
    return c;
  }

  // ---------- reading ----------

  async overview() {
    const v = await this.viewer();
    const rows = await this.prisma.db.course.findMany({
      where: this.visibleWhere(v),
      include: courseInclude,
      orderBy: { startsOn: 'desc' },
      take: 200,
    });
    const courses = rows.map((c) => this.present(c, v));
    const today = todayIst();
    const sessions = await this.prisma.db.courseSession.findMany({
      where: {
        courseId: { in: rows.map((c) => c.id) },
        startsAt: { gte: toDate(today), lt: toDate(addDays(today, 8)) },
      },
      include: { course: { select: { title: true, mode: true, meetingLink: true } } },
      orderBy: { startsAt: 'asc' },
      take: 8,
    });
    const all = rows.flatMap((c) => c.enrollments.map((e) => ({ e, hours: Number(c.hours) })));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const recent = await this.prisma.db.enrollment.count({
      where: { courseId: { in: rows.map((c) => c.id) }, createdAt: { gte: since } },
    });
    return {
      courses,
      sessions: sessions.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        title: s.title,
        course: s.course.title,
        startsAt: s.startsAt.toISOString(),
        minutes: s.minutes,
        location: s.location,
        mode: s.course.mode,
        meetingLink: s.course.meetingLink,
      })),
      stats: {
        running: courses.filter((c) => c.status === 'ONGOING').length,
        mandatory: courses.filter((c) => c.mandatory).length,
        registrations: all.length,
        registrationsThisMonth: recent,
        completionPct: all.length
          ? Math.round((all.filter(({ e }) => e.progress >= 100).length / all.length) * 100)
          : null,
        hours: Math.round(all.reduce((n, { e, hours }) => n + (e.progress / 100) * hours, 0)),
      },
      canManage: v.manage,
      selfEmployeeId: v.self,
    };
  }

  /** Learners on a course: everyone for its lead and HR, the viewer's team for managers. */
  async learners(courseId: string) {
    const v = await this.viewer();
    const c = await this.visible(courseId, v);
    const full = this.canRun(v, c);
    if (!full && v.team.size === 0)
      throw new ForbiddenException('Only the course lead and HR see learners');
    const rows = await this.prisma.db.enrollment.findMany({
      where: { courseId, ...(full ? {} : { employeeId: { in: [...v.team] } }) },
      include: { employee: person },
      orderBy: [{ progress: 'asc' }, { employee: { firstName: 'asc' } }],
    });
    return rows.map((r) => ({
      id: r.id,
      employee: r.employee,
      progress: r.progress,
      completedAt: r.completedAt?.toISOString() ?? null,
      canUpdate: full || r.employeeId === v.self,
    }));
  }

  /** Courses one person is enrolled in, for their profile. */
  async forEmployee(employeeId: string) {
    const v = await this.viewer();
    if (!v.manage && v.self !== employeeId && !v.team.has(employeeId))
      throw new NotFoundException('Employee not found');
    const rows = await this.prisma.db.enrollment.findMany({
      where: { employeeId },
      include: {
        course: {
          select: { id: true, title: true, mandatory: true, endsOn: true, startsOn: true },
        },
      },
      orderBy: { course: { startsOn: 'desc' } },
      take: 20,
    });
    return rows.map((r) => ({
      id: r.id,
      progress: r.progress,
      completedAt: r.completedAt?.toISOString() ?? null,
      course: {
        id: r.course.id,
        title: r.course.title,
        mandatory: r.course.mandatory,
        endsOn: isoDay(r.course.endsOn),
        status: LearningService.status(r.course),
      },
    }));
  }

  // ---------- courses ----------

  private async checkRefs(input: { leadId?: string | null; departmentId?: string | null }) {
    if (input.leadId) {
      const lead = await this.prisma.db.employee.findUnique({ where: { id: input.leadId } });
      if (!lead) throw new NotFoundException('Course lead not found');
    }
    if (input.departmentId) {
      const d = await this.prisma.db.department.findUnique({ where: { id: input.departmentId } });
      if (!d) throw new NotFoundException('Department not found');
    }
  }

  /** Enrol everyone in a course's audience who isn't already (for mandatory courses). */
  private async enrolAudience(c: { id: string; departmentId: string | null }) {
    const people = await this.prisma.db.employee.findMany({
      where: {
        status: { not: 'EXITED' },
        ...(c.departmentId ? { departmentId: c.departmentId } : {}),
      },
      select: { id: true },
    });
    const tenantId = requireTenantId();
    await this.prisma.db.enrollment.createMany({
      data: people.map((p) => ({ tenantId, courseId: c.id, employeeId: p.id })),
      skipDuplicates: true,
    });
  }

  async createCourse(input: CourseInput) {
    const v = await this.viewer();
    await this.checkRefs(input);
    const c = await this.prisma.db.course.create({
      data: {
        tenantId: requireTenantId(),
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        leadId: input.leadId ?? null,
        departmentId: input.departmentId ?? null,
        mandatory: input.mandatory,
        seats: input.mandatory ? null : (input.seats ?? null),
        startsOn: toDate(input.startsOn),
        endsOn: toDate(input.endsOn),
        hours: input.hours,
        mode: input.mode,
        meetingLink: input.meetingLink || null,
      },
    });
    if (c.mandatory) await this.enrolAudience(c);
    await this.audit.record('learning.course_created', 'Course', c.id, {
      title: c.title,
      mandatory: c.mandatory,
    });
    return this.present(await this.load(c.id), v);
  }

  async updateCourse(id: string, input: UpdateCourseInput) {
    const v = await this.viewer();
    const c = await this.load(id);
    if (!this.canRun(v, c))
      throw new ForbiddenException('Only the course lead and HR change a course');
    if (!v.manage && (input.mandatory !== undefined || input.departmentId !== undefined))
      throw new ForbiddenException('Only HR changes who a course is for');
    await this.checkRefs(input);
    const startsOn = input.startsOn ?? isoDay(c.startsOn);
    const endsOn = input.endsOn ?? isoDay(c.endsOn);
    if (endsOn < startsOn) throw new BadRequestException('The course ends before it starts');
    const updated = await this.prisma.db.course.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        leadId: input.leadId,
        departmentId: input.departmentId,
        mandatory: input.mandatory,
        seats: input.seats,
        startsOn: input.startsOn ? toDate(input.startsOn) : undefined,
        endsOn: input.endsOn ? toDate(input.endsOn) : undefined,
        hours: input.hours,
        mode: input.mode,
        meetingLink: input.meetingLink === '' ? null : input.meetingLink,
      },
    });
    if (updated.mandatory) await this.enrolAudience(updated);
    await this.audit.record('learning.course_updated', 'Course', id, { title: updated.title });
    return this.present(await this.load(id), v);
  }

  async deleteCourse(id: string) {
    const c = await this.load(id);
    await this.prisma.db.course.delete({ where: { id } });
    await this.audit.record('learning.course_deleted', 'Course', id, { title: c.title });
  }

  async addSession(courseId: string, input: CourseSessionInput) {
    const v = await this.viewer();
    const c = await this.load(courseId);
    if (!this.canRun(v, c))
      throw new ForbiddenException('Only the course lead and HR schedule sessions');
    return this.prisma.db.courseSession.create({
      data: {
        tenantId: requireTenantId(),
        courseId,
        title: input.title,
        startsAt: new Date(input.startsAt),
        minutes: input.minutes,
        location: input.location ?? null,
      },
    });
  }

  async deleteSession(courseId: string, sessionId: string) {
    const v = await this.viewer();
    const c = await this.load(courseId);
    if (!this.canRun(v, c))
      throw new ForbiddenException('Only the course lead and HR change sessions');
    const s = await this.prisma.db.courseSession.findFirst({ where: { id: sessionId, courseId } });
    if (!s) throw new NotFoundException('Session not found');
    await this.prisma.db.courseSession.delete({ where: { id: sessionId } });
  }

  // ---------- enrolment ----------

  async enrolSelf(courseId: string) {
    const v = await this.viewer();
    if (!v.self) throw new BadRequestException('Your login is not linked to an employee record');
    const c = await this.visible(courseId, v);
    const view = this.present(c, v);
    if (view.mine) throw new ConflictException('You are already signed up');
    if (!view.canEnroll)
      throw new BadRequestException(
        view.status === 'COMPLETED' ? 'This course has finished' : 'This course is full',
      );
    await this.prisma.db.enrollment.create({
      data: { tenantId: requireTenantId(), courseId, employeeId: v.self },
    });
    await this.audit.record('learning.enrolled', 'Course', courseId, {
      employeeId: v.self,
      course: c.title,
      bySelf: true,
    });
    return this.present(await this.load(courseId), v);
  }

  async leave(courseId: string) {
    const v = await this.viewer();
    const c = await this.visible(courseId, v);
    if (c.mandatory) throw new BadRequestException('You can’t leave a mandatory course');
    const mine = c.enrollments.find((e) => e.employeeId === v.self);
    if (!mine) throw new NotFoundException('You are not signed up');
    await this.prisma.db.enrollment.delete({ where: { id: mine.id } });
  }

  async assign(courseId: string, employeeIds: string[]) {
    const v = await this.viewer();
    const c = await this.load(courseId);
    if (!this.canRun(v, c))
      throw new ForbiddenException('Only the course lead and HR enrol people');
    const people = await this.prisma.db.employee.findMany({
      where: { id: { in: employeeIds }, status: { not: 'EXITED' } },
      select: { id: true },
    });
    if (people.length !== new Set(employeeIds).size)
      throw new NotFoundException('Employee not found');
    const fresh = people.filter((p) => !c.enrollments.some((e) => e.employeeId === p.id));
    if (c.seats !== null && c.enrollments.length + fresh.length > c.seats)
      throw new BadRequestException(`Only ${c.seats - c.enrollments.length} seats left`);
    const tenantId = requireTenantId();
    await this.prisma.db.enrollment.createMany({
      data: fresh.map((p) => ({ tenantId, courseId, employeeId: p.id })),
      skipDuplicates: true,
    });
    for (const p of fresh)
      await this.audit.record('learning.enrolled', 'Course', courseId, {
        employeeId: p.id,
        course: c.title,
      });
    return { added: fresh.length };
  }

  async setProgress(enrollmentId: string, progress: number) {
    const v = await this.viewer();
    const e = await this.prisma.db.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { leadId: true, title: true } } },
    });
    if (!e || (e.employeeId !== v.self && !this.canRun(v, e.course)))
      throw new NotFoundException('Enrolment not found');
    const updated = await this.prisma.db.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progress,
        completedAt: progress >= 100 ? (e.completedAt ?? new Date()) : null,
      },
    });
    if (progress >= 100 && !e.completedAt)
      await this.audit.record('learning.completed', 'Course', e.courseId, {
        employeeId: e.employeeId,
        course: e.course.title,
      });
    return { id: updated.id, progress: updated.progress };
  }
}
