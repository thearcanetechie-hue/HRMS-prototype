import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AddTaskInput,
  CreateTemplateInput,
  ListChecklistsQuery,
  StartChecklistInput,
  TemplateTaskInput,
  UpdateTaskInput,
  UpdateTemplateInput,
} from '@hrms/shared';
import { ChecklistKind, Prisma, TaskAssignee } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TEMPLATES } from './default-templates';

const DAY = 86_400_000;

const checklistInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      managerId: true,
      status: true,
      dateOfJoining: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  },
  tasks: { orderBy: { position: 'asc' } },
} satisfies Prisma.EmployeeChecklistInclude;

type ChecklistRow = Prisma.EmployeeChecklistGetPayload<{ include: typeof checklistInclude }>;

/** Who the caller is, worked out once per request. */
interface Viewer {
  manage: boolean;
  readAll: boolean;
  self: string | null;
  /** Everyone in the caller's reporting line (empty unless they have team.read). */
  team: Set<string>;
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Onboarding and offboarding checklists.
 *
 * - `lifecycle.manage` (HR): start, cancel and edit checklists and templates; tick any task.
 * - Managers: see and tick MANAGER tasks for people in their reporting line.
 * - Employees: see their own checklist and tick EMPLOYEE tasks.
 * - `employee.read` alone can see every checklist but not change it.
 *
 * Finishing onboarding makes the person Active. Starting offboarding puts them On notice with
 * the last working day as their exit date; finishing it marks them Exited and turns off their
 * login, so a forgotten access revocation can't leave an account open.
 */
@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  // ---------- templates ----------

  async templates(kind?: ChecklistKind) {
    await this.ensureDefaults();
    return this.prisma.db.checklistTemplate.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createTemplate(input: CreateTemplateInput) {
    await this.ensureDefaults();
    const template = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, input.kind);
      return tx.checklistTemplate.create({
        data: {
          tenantId: requireTenantId(),
          name: input.name,
          kind: input.kind,
          isDefault: input.isDefault,
          tasks: input.tasks as Prisma.InputJsonValue,
        },
      });
    });
    await this.audit.record('checklist.template_created', 'ChecklistTemplate', template.id, {
      name: template.name,
    });
    return template;
  }

  async updateTemplate(id: string, input: UpdateTemplateInput) {
    const current = await this.prisma.db.checklistTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Checklist template not found');
    if (input.isDefault === false && current.isDefault)
      throw new BadRequestException('Make another template the default instead');
    const template = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, current.kind);
      return tx.checklistTemplate.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.tasks ? { tasks: input.tasks as Prisma.InputJsonValue } : {}),
        },
      });
    });
    await this.audit.record('checklist.template_updated', 'ChecklistTemplate', id, {
      fields: Object.keys(input),
    });
    return template;
  }

  async deleteTemplate(id: string) {
    const current = await this.prisma.db.checklistTemplate.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Checklist template not found');
    if (current.isDefault) throw new BadRequestException('The default template can’t be deleted');
    await this.prisma.db.checklistTemplate.delete({ where: { id } });
    await this.audit.record('checklist.template_deleted', 'ChecklistTemplate', id, {
      name: current.name,
    });
  }

  // ---------- checklists ----------

  async list(q: ListChecklistsQuery) {
    const viewer = await this.viewer();
    const where: Prisma.EmployeeChecklistWhereInput = {
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    };
    if (!viewer.manage && !viewer.readAll) {
      const ids = [...viewer.team, ...(viewer.self ? [viewer.self] : [])];
      where.employeeId = q.employeeId
        ? ids.includes(q.employeeId)
          ? q.employeeId
          : '00000000-0000-0000-0000-000000000000'
        : { in: ids };
    }
    const rows = await this.prisma.db.employeeChecklist.findMany({
      where,
      include: checklistInclude,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
      take: 200,
    });
    const shaped = await this.present(rows, viewer);
    return q.mine ? shaped.filter((c) => c.tasks.some((t) => t.canTick && !t.doneAt)) : shaped;
  }

  async get(id: string) {
    const viewer = await this.viewer();
    const row = await this.prisma.db.employeeChecklist.findUnique({
      where: { id },
      include: checklistInclude,
    });
    if (!row || !this.canSee(viewer, row.employeeId))
      throw new NotFoundException('Checklist not found');
    return (await this.present([row], viewer))[0]!;
  }

  /** Starts a checklist from a template. Called by HR, and automatically for new joiners. */
  async start(employeeId: string, input: StartChecklistInput, { quiet = false } = {}) {
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, status: true, dateOfJoining: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (input.kind === 'OFFBOARDING' && employee.status === 'EXITED')
      throw new BadRequestException('This person has already left');
    if (input.kind === 'OFFBOARDING' && !input.startDate)
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { startDate: ['Choose the last working day'] },
      });

    await this.ensureDefaults();
    const template = input.templateId
      ? await this.prisma.db.checklistTemplate.findUnique({ where: { id: input.templateId } })
      : await this.prisma.db.checklistTemplate.findFirst({
          where: { kind: input.kind, isDefault: true },
        });
    if (!template || template.kind !== input.kind)
      throw new NotFoundException('Checklist template not found');

    const startDate = input.startDate ? toDate(input.startDate) : employee.dateOfJoining;
    const tasks = template.tasks as unknown as TemplateTaskInput[];
    const tenantId = requireTenantId();

    const checklist = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.employeeChecklist.create({
          data: {
            tenantId,
            employeeId,
            templateId: template.id,
            kind: input.kind,
            startDate,
            reason: input.reason ?? null,
            createdById: currentContext().userId ?? null,
          },
        });
        await tx.checklistTask.createMany({
          data: tasks.map((t, position) => ({
            tenantId,
            checklistId: created.id,
            position,
            title: t.title,
            description: t.description ?? null,
            assignee: t.assignee as TaskAssignee,
            dueDate: new Date(startDate.getTime() + (t.dueOffsetDays ?? 0) * DAY),
            documentCategory: t.documentCategory ?? null,
          })),
        });
        if (input.kind === 'OFFBOARDING')
          await tx.employee.update({
            where: { id: employeeId },
            data: { status: 'ON_NOTICE', dateOfExit: startDate },
          });
        return created;
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
          throw new ConflictException(
            `There is already an open ${input.kind.toLowerCase()} checklist for this person`,
          );
        throw err;
      });

    await this.audit.record('checklist.started', 'EmployeeChecklist', checklist.id, {
      employeeId,
      kind: input.kind,
      template: template.name,
      ...(quiet ? { automatic: true } : {}),
    });
    return quiet ? null : this.get(checklist.id);
  }

  async cancel(id: string) {
    const checklist = await this.prisma.db.employeeChecklist.findUnique({ where: { id } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    if (checklist.status !== 'OPEN')
      throw new BadRequestException('Only open checklists can be cancelled');
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeChecklist.update({ where: { id }, data: { status: 'CANCELLED' } });
      // A withdrawn resignation: the person stays on.
      if (checklist.kind === 'OFFBOARDING')
        await tx.employee.update({
          where: { id: checklist.employeeId },
          data: { status: 'ACTIVE', dateOfExit: null },
        });
    });
    await this.audit.record('checklist.cancelled', 'EmployeeChecklist', id, {
      employeeId: checklist.employeeId,
      kind: checklist.kind,
    });
    return this.get(id);
  }

  async addTask(checklistId: string, input: AddTaskInput) {
    const checklist = await this.prisma.db.employeeChecklist.findUnique({
      where: { id: checklistId },
      include: { tasks: { select: { position: true } } },
    });
    if (!checklist) throw new NotFoundException('Checklist not found');
    await this.prisma.db.checklistTask.create({
      data: {
        tenantId: requireTenantId(),
        checklistId,
        position: Math.max(-1, ...checklist.tasks.map((t) => t.position)) + 1,
        title: input.title,
        description: input.description ?? null,
        assignee: input.assignee,
        dueDate: input.dueDate ? toDate(input.dueDate) : checklist.startDate,
        documentCategory: input.documentCategory ?? null,
      },
    });
    if (checklist.status === 'COMPLETED')
      await this.prisma.db.employeeChecklist.update({
        where: { id: checklistId },
        data: { status: 'OPEN', completedAt: null },
      });
    await this.audit.record('checklist.task_added', 'EmployeeChecklist', checklistId, {
      title: input.title,
    });
    return this.get(checklistId);
  }

  async removeTask(checklistId: string, taskId: string) {
    const task = await this.prisma.db.checklistTask.findFirst({
      where: { id: taskId, checklistId },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.prisma.db.checklistTask.delete({ where: { id: taskId } });
    await this.audit.record('checklist.task_removed', 'EmployeeChecklist', checklistId, {
      title: task.title,
    });
    await this.settle(checklistId);
    return this.get(checklistId);
  }

  async updateTask(checklistId: string, taskId: string, input: UpdateTaskInput) {
    const viewer = await this.viewer();
    const checklist = await this.prisma.db.employeeChecklist.findUnique({
      where: { id: checklistId },
      include: { tasks: { where: { id: taskId } } },
    });
    const task = checklist?.tasks[0];
    if (!checklist || !task || !this.canSee(viewer, checklist.employeeId))
      throw new NotFoundException('Task not found');
    if (checklist.status === 'CANCELLED')
      throw new BadRequestException('This checklist was cancelled');
    if (!this.canTick(viewer, checklist.employeeId, task.assignee))
      throw new ForbiddenException('This task is for someone else');

    await this.prisma.db.checklistTask.update({
      where: { id: taskId },
      data: input.done
        ? {
            doneAt: new Date(),
            doneById: currentContext().userId ?? null,
            note: input.note ?? null,
          }
        : { doneAt: null, doneById: null, note: input.note ?? null },
    });
    await this.audit.record(
      input.done ? 'checklist.task_done' : 'checklist.task_reopened',
      'EmployeeChecklist',
      checklistId,
      { taskId, title: task.title },
    );
    await this.settle(checklistId);
    return this.get(checklistId);
  }

  // ---------- helpers ----------

  /** Closes or reopens a checklist to match its tasks, and moves the employee along. */
  private async settle(checklistId: string) {
    const checklist = await this.prisma.db.employeeChecklist.findUnique({
      where: { id: checklistId },
      include: { tasks: { select: { doneAt: true } } },
    });
    if (!checklist || checklist.status === 'CANCELLED') return;
    const allDone = checklist.tasks.length > 0 && checklist.tasks.every((t) => t.doneAt);

    if (allDone && checklist.status === 'OPEN') {
      await this.prisma.$transaction(async (tx) => {
        await tx.employeeChecklist.update({
          where: { id: checklistId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        const employee = await tx.employee.findUniqueOrThrow({
          where: { id: checklist.employeeId },
          select: { status: true, userId: true },
        });
        if (checklist.kind === 'ONBOARDING' && employee.status === 'ONBOARDING')
          await tx.employee.update({
            where: { id: checklist.employeeId },
            data: { status: 'ACTIVE' },
          });
        if (checklist.kind === 'OFFBOARDING') {
          await tx.employee.update({
            where: { id: checklist.employeeId },
            data: { status: 'EXITED' },
          });
          if (employee.userId) {
            await tx.user.update({ where: { id: employee.userId }, data: { status: 'DISABLED' } });
            await tx.session.updateMany({
              where: { userId: employee.userId, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
        }
      });
      await this.audit.record('checklist.completed', 'EmployeeChecklist', checklistId, {
        employeeId: checklist.employeeId,
        kind: checklist.kind,
      });
    } else if (!allDone && checklist.status === 'COMPLETED') {
      // Reopening a task reopens the checklist; the employee's status is left as it is.
      await this.prisma.db.employeeChecklist.update({
        where: { id: checklistId },
        data: { status: 'OPEN', completedAt: null },
      });
    }
  }

  private async viewer(): Promise<Viewer> {
    const self = await this.access.selfEmployeeId();
    const team =
      self && this.access.can('team.read')
        ? new Set(await this.access.reportingLine(self))
        : new Set<string>();
    return {
      manage: this.access.can('lifecycle.manage'),
      readAll: this.access.can('employee.read'),
      self,
      team,
    };
  }

  private canSee(v: Viewer, employeeId: string) {
    return v.manage || v.readAll || v.self === employeeId || v.team.has(employeeId);
  }

  private canTick(v: Viewer, employeeId: string, assignee: TaskAssignee) {
    if (v.manage) return true;
    if (assignee === 'EMPLOYEE') return v.self === employeeId;
    if (assignee === 'MANAGER') return v.team.has(employeeId);
    return false;
  }

  private async present(rows: ChecklistRow[], viewer: Viewer) {
    const userIds = [
      ...new Set(rows.flatMap((r) => r.tasks.map((t) => t.doneById)).filter(Boolean)),
    ];
    const users = userIds.length
      ? await this.prisma.db.user.findMany({
          where: { id: { in: userIds as string[] } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const today = isoDay(new Date());
    return rows.map(({ tasks, startDate, ...c }) => ({
      ...c,
      startDate: isoDay(startDate),
      canManage: viewer.manage,
      progress: { done: tasks.filter((t) => t.doneAt).length, total: tasks.length },
      tasks: tasks.map(({ doneById, dueDate, tenantId: _t, ...t }) => ({
        ...t,
        dueDate: isoDay(dueDate),
        overdue: !t.doneAt && c.status === 'OPEN' && isoDay(dueDate) < today,
        doneBy: doneById ? (names.get(doneById) ?? 'Someone') : null,
        canTick: c.status !== 'CANCELLED' && this.canTick(viewer, c.employeeId, t.assignee),
      })),
    }));
  }

  private async clearDefault(tx: Prisma.TransactionClient, kind: ChecklistKind) {
    await tx.checklistTemplate.updateMany({
      where: { tenantId: requireTenantId(), kind, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async ensureDefaults() {
    if (await this.prisma.db.checklistTemplate.count()) return;
    await this.prisma.db.checklistTemplate.createMany({
      data: DEFAULT_TEMPLATES.map((t) => ({
        name: t.name,
        kind: t.kind,
        isDefault: true,
        tasks: t.tasks as Prisma.InputJsonValue,
      })) as Prisma.ChecklistTemplateCreateManyInput[],
      skipDuplicates: true,
    });
  }
}
