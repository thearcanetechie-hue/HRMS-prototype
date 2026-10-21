import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelInput, NewConversationInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { addDays, isoDay, todayIst } from '../attendance/days';
import { LeaveService } from '../attendance/leave.service';
import { ClaimsService } from '../claims/claims.service';
import { requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { name: true } },
    designation: { select: { name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
const inr = (n: number) => `₹ ${Math.round(n).toLocaleString('en-IN')}`;

export type Folder = 'all' | 'starred' | 'sent' | 'channels';

/**
 * Messages between people, public channels, and the approvals waiting on the caller.
 *
 * - A direct conversation is visible only to its members. Channels are open to everyone in the
 *   workspace; posting in one joins it.
 * - Unread counts come from each member's `lastReadAt`; opening a conversation marks it read.
 * - Approvals are not stored here: they are the pending leave, overtime, expense and checklist
 *   items the caller can act on, read from those modules.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly leave: LeaveService,
    private readonly claims: ClaimsService,
    private readonly lifecycle: LifecycleService,
  ) {}

  private async self() {
    const id = await this.access.selfEmployeeId();
    if (!id) throw new BadRequestException('Your login is not linked to an employee record');
    return id;
  }

  /** A conversation the caller can read: a channel, or a direct one they belong to. */
  private async readable(id: string, self: string) {
    const c = await this.prisma.db.conversation.findFirst({
      where: { id, OR: [{ kind: 'CHANNEL' }, { members: { some: { employeeId: self } } }] },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  private async unreadFor(self: string, conversationIds: string[]) {
    if (!conversationIds.length) return new Map<string, number>();
    const rows = await this.prisma.db.$queryRaw<{ conversationId: string; n: bigint }[]>`
      SELECT m."conversationId", count(*) AS n
      FROM "Message" m
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."employeeId" = ${self}::uuid
      WHERE m."conversationId" = ANY(${conversationIds}::uuid[])
        AND m."authorId" <> ${self}::uuid
        AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
      GROUP BY m."conversationId"`;
    return new Map(rows.map((r) => [r.conversationId, Number(r.n)]));
  }

  // ---------- conversations ----------

  async conversations(folder: Folder = 'all', q?: string) {
    const self = await this.self();
    const where: Prisma.ConversationWhereInput =
      folder === 'channels'
        ? { kind: 'CHANNEL', members: { some: { employeeId: self } } }
        : {
            kind: 'DIRECT',
            members: {
              some: { employeeId: self, ...(folder === 'starred' ? { starred: true } : {}) },
            },
            ...(folder === 'sent' ? { createdById: self } : {}),
          };
    if (q?.trim())
      where.AND = [
        {
          OR: [
            { subject: { contains: q.trim(), mode: 'insensitive' } },
            { messages: { some: { body: { contains: q.trim(), mode: 'insensitive' } } } },
            {
              members: {
                some: {
                  employee: {
                    OR: [
                      { firstName: { contains: q.trim(), mode: 'insensitive' } },
                      { lastName: { contains: q.trim(), mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          ],
        },
      ];
    const rows = await this.prisma.db.conversation.findMany({
      where,
      include: {
        members: { include: { employee: person } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { author: person } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    const unread = await this.unreadFor(
      self,
      rows.map((r) => r.id),
    );
    return rows.map((c) => this.presentConversation(c, self, unread.get(c.id) ?? 0));
  }

  private presentConversation(
    c: Prisma.ConversationGetPayload<{
      include: {
        members: { include: { employee: typeof person } };
        messages: { include: { author: typeof person } };
      };
    }>,
    self: string,
    unread: number,
  ) {
    const me = c.members.find((m) => m.employeeId === self);
    const others = c.members.filter((m) => m.employeeId !== self).map((m) => m.employee);
    const last = c.messages[0];
    return {
      id: c.id,
      kind: c.kind,
      subject: c.subject,
      channelName: c.channelName,
      with: others,
      preview: last
        ? `${last.authorId === self ? 'You: ' : c.kind === 'CHANNEL' ? `${last.author.firstName}: ` : ''}${last.body}`
        : (c.description ?? ''),
      lastMessageAt: c.lastMessageAt.toISOString(),
      unread,
      starred: me?.starred ?? false,
      joined: Boolean(me),
      members: c.members.length,
    };
  }

  async open(id: string) {
    const self = await this.self();
    const c = await this.readable(id, self);
    const [messages, members] = await Promise.all([
      this.prisma.db.message.findMany({
        where: { conversationId: id },
        include: { author: person },
        orderBy: { createdAt: 'asc' },
        take: 300,
      }),
      this.prisma.db.conversationMember.findMany({
        where: { conversationId: id },
        include: { employee: person },
      }),
    ]);
    await this.prisma.db.conversationMember.updateMany({
      where: { conversationId: id, employeeId: self },
      data: { lastReadAt: new Date() },
    });
    const me = members.find((m) => m.employeeId === self);
    return {
      id: c.id,
      kind: c.kind,
      subject: c.subject,
      channelName: c.channelName,
      description: c.description,
      starred: me?.starred ?? false,
      joined: Boolean(me),
      /** Everyone else in the conversation. */
      members: members.filter((m) => m.employeeId !== self).map((m) => m.employee),
      memberCount: members.length,
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        author: m.author,
        mine: m.authorId === self,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async start(input: NewConversationInput) {
    const self = await this.self();
    const ids = [...new Set(input.toIds.filter((id) => id !== self))];
    if (!ids.length) throw new BadRequestException('Pick at least one other person');
    const people = await this.prisma.db.employee.findMany({
      where: { id: { in: ids }, status: { not: 'EXITED' } },
      select: { id: true, firstName: true },
    });
    if (people.length !== ids.length) throw new NotFoundException('Employee not found');
    const tenantId = requireTenantId();
    const now = new Date();
    const c = await this.prisma.db.conversation.create({
      data: {
        tenantId,
        kind: 'DIRECT',
        subject: input.subject?.trim() || input.body.slice(0, 60),
        createdById: self,
        lastMessageAt: now,
        members: {
          create: [
            { tenantId, employeeId: self, lastReadAt: now },
            ...ids.map((employeeId) => ({ tenantId, employeeId })),
          ],
        },
        messages: { create: { tenantId, authorId: self, body: input.body, createdAt: now } },
      },
    });
    return this.open(c.id);
  }

  async send(id: string, body: string) {
    const self = await this.self();
    const c = await this.readable(id, self);
    const tenantId = requireTenantId();
    const now = new Date();
    if (c.kind === 'CHANNEL')
      await this.prisma.db.conversationMember.upsert({
        where: { conversationId_employeeId: { conversationId: id, employeeId: self } },
        create: { tenantId, conversationId: id, employeeId: self, lastReadAt: now },
        update: { lastReadAt: now },
      });
    const m = await this.prisma.db.message.create({
      data: { tenantId, conversationId: id, authorId: self, body, createdAt: now },
      include: { author: person },
    });
    await this.prisma.db.conversation.update({ where: { id }, data: { lastMessageAt: now } });
    await this.prisma.db.conversationMember.updateMany({
      where: { conversationId: id, employeeId: self },
      data: { lastReadAt: now },
    });
    return {
      id: m.id,
      body: m.body,
      author: m.author,
      mine: true,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async star(id: string, starred: boolean) {
    const self = await this.self();
    const res = await this.prisma.db.conversationMember.updateMany({
      where: { conversationId: id, employeeId: self },
      data: { starred },
    });
    if (!res.count) throw new NotFoundException('Conversation not found');
    return { starred };
  }

  // ---------- channels ----------

  async channels() {
    const self = await this.self();
    // Every workspace has a company-wide channel; new workspaces get it on first visit.
    await this.prisma.db.conversation.upsert({
      where: { tenantId_channelName: { tenantId: requireTenantId(), channelName: 'all-company' } },
      create: {
        tenantId: requireTenantId(),
        kind: 'CHANNEL',
        subject: '#all-company',
        channelName: 'all-company',
        description: 'Everyone in the company',
      },
      update: {},
    });
    const rows = await this.prisma.db.conversation.findMany({
      where: { kind: 'CHANNEL' },
      include: {
        members: { where: { employeeId: self }, select: { id: true } },
        _count: { select: { members: true } },
      },
      orderBy: { channelName: 'asc' },
    });
    const unread = await this.unreadFor(
      self,
      rows.map((r) => r.id),
    );
    return rows.map((c) => ({
      id: c.id,
      name: c.channelName ?? c.subject,
      description: c.description,
      joined: c.members.length > 0,
      members: c._count.members,
      unread: unread.get(c.id) ?? 0,
    }));
  }

  async createChannel(input: ChannelInput) {
    const self = await this.self();
    const tenantId = requireTenantId();
    const taken = await this.prisma.db.conversation.findFirst({
      where: { kind: 'CHANNEL', channelName: input.name },
    });
    if (taken) throw new ConflictException(`#${input.name} already exists`);
    const c = await this.prisma.db.conversation.create({
      data: {
        tenantId,
        kind: 'CHANNEL',
        subject: `#${input.name}`,
        channelName: input.name,
        description: input.description ?? null,
        createdById: self,
        members: { create: { tenantId, employeeId: self, lastReadAt: new Date() } },
      },
    });
    return this.open(c.id);
  }

  async join(id: string, joined: boolean) {
    const self = await this.self();
    const c = await this.readable(id, self);
    if (c.kind !== 'CHANNEL') throw new BadRequestException('Only channels can be joined or left');
    if (joined)
      await this.prisma.db.conversationMember.upsert({
        where: { conversationId_employeeId: { conversationId: id, employeeId: self } },
        create: {
          tenantId: requireTenantId(),
          conversationId: id,
          employeeId: self,
          lastReadAt: new Date(),
        },
        update: {},
      });
    else
      await this.prisma.db.conversationMember.deleteMany({
        where: { conversationId: id, employeeId: self },
      });
    return { joined };
  }

  // ---------- approvals and counts ----------

  /** Everything waiting on the caller's decision, newest first. */
  async approvals() {
    const today = todayIst();
    const [leave, overtime, expenses, checklists] = await Promise.all([
      this.leave.list({ status: 'PENDING', toDecide: true }),
      this.claims.listOvertime({ status: 'PENDING' }),
      this.claims.listExpenses({ status: 'PENDING' }),
      this.lifecycle.list({ status: 'OPEN', mine: false }),
    ]);
    const items = [
      ...leave.map((r) => ({
        kind: 'LEAVE' as const,
        id: r.id,
        employee: r.employee,
        title: `${r.leaveType.name} leave`,
        summary: `${isoDay(new Date(r.startDate))}${r.endDate !== r.startDate ? ` to ${isoDay(new Date(r.endDate))}` : ''} · ${r.halfDay ? 'half day' : `${r.days} ${r.days === 1 ? 'day' : 'days'}`}`,
        at: new Date(r.createdAt).toISOString(),
        href: '/attendance?tab=requests',
      })),
      ...overtime
        .filter((r) => r.canDecide)
        .map((r) => ({
          kind: 'OVERTIME' as const,
          id: r.id,
          employee: r.employee,
          title: `Overtime · ${r.hours} h`,
          summary: `${r.date} · ${r.reason}`,
          at: r.createdAt.toISOString(),
          href: '/claims',
        })),
      ...expenses
        .filter((r) => r.canDecide)
        .map((r) => ({
          kind: 'EXPENSE' as const,
          id: r.id,
          employee: r.employee,
          title: `${r.category.name} · ${inr(Number(r.amount))}`,
          summary: r.description,
          at: r.createdAt.toISOString(),
          href: '/claims?tab=expenses',
        })),
      ...checklists.flatMap((c) =>
        c.tasks
          .filter((t) => t.canTick && !t.doneAt && t.dueDate <= addDays(today, 7))
          .map((t) => ({
            kind: 'TASK' as const,
            id: t.id,
            employee: c.employee,
            title: t.title,
            summary: `${c.kind === 'OFFBOARDING' ? 'Offboarding' : 'Onboarding'} for ${name(c.employee)} · ${t.overdue ? 'overdue' : `due ${t.dueDate}`}`,
            at: `${t.dueDate}T00:00:00.000Z`,
            href: `/employees/${c.employee.id}`,
          })),
      ),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Unread messages and waiting approvals, for the navigation badge. */
  async counts() {
    const self = await this.access.selfEmployeeId();
    let unread = 0;
    if (self) {
      const ids = await this.prisma.db.conversationMember.findMany({
        where: { employeeId: self },
        select: { conversationId: true },
      });
      const map = await this.unreadFor(
        self,
        ids.map((i) => i.conversationId),
      );
      unread = [...map.values()].reduce((a, b) => a + b, 0);
    }
    const approvals = (await this.approvals()).length;
    return { unread, approvals };
  }
}
