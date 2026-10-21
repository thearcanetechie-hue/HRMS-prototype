import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PollInput, PostInput, PulseResponseInput, PulseSurveyInput } from '@hrms/shared';
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
    designation: { select: { name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

const postInclude = {
  author: person,
  department: { select: { id: true, name: true } },
  kudos: { select: { value: true, to: person } },
  _count: { select: { reactions: true, comments: true } },
} satisfies Prisma.PostInclude;
type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

/** Pulse results stay hidden until this many people have answered, to keep them anonymous. */
export const PULSE_MIN_RESPONSES = 3;
const PAGE = 20;

interface Viewer {
  manage: boolean;
  self: string | null;
  departmentId: string | null;
  team: Set<string>;
}

export type FeedTab = 'all' | 'announcements' | 'kudos' | 'team';

/**
 * The company feed, polls, pulse surveys and celebrations.
 *
 * - Anyone with an employee record posts updates and wins, likes, comments and RSVPs.
 *   Announcements and events come from `engagement.manage`, who can also pin or remove posts.
 * - Posts go to everyone or to one department.
 * - Kudos given on the Performance screen appear on the feed.
 * - Pulse surveys are anonymous: who answered and what they answered are stored apart, and
 *   results show only once enough people have answered.
 */
@Injectable()
export class EngagementService {
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
      manage: this.access.can('engagement.manage'),
      self,
      departmentId: me?.departmentId ?? null,
      team,
    };
  }

  private requireSelf(v: Viewer) {
    if (!v.self) throw new BadRequestException('Your login is not linked to an employee record');
    return v.self;
  }

  private audience(v: Viewer): Prisma.PostWhereInput {
    if (v.manage) return {};
    return {
      OR: [
        { departmentId: null },
        ...(v.departmentId ? [{ departmentId: v.departmentId }] : []),
        ...(v.self ? [{ authorId: v.self }] : []),
      ],
    };
  }

  private async visiblePost(id: string, v: Viewer) {
    const post = await this.prisma.db.post.findFirst({ where: { id, ...this.audience(v) } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // ---------- feed ----------

  async feed(tab: FeedTab = 'all', before?: string) {
    const v = await this.viewer();
    const where: Prisma.PostWhereInput = { AND: [this.audience(v)] };
    const and = where.AND as Prisma.PostWhereInput[];
    if (tab === 'announcements') and.push({ kind: { in: ['ANNOUNCEMENT', 'EVENT'] } });
    if (tab === 'kudos') and.push({ kind: 'KUDOS' });
    if (tab === 'team') {
      const ids = [...v.team, ...(v.self ? [v.self] : [])];
      and.push({
        OR: [
          { authorId: { in: ids } },
          ...(v.departmentId ? [{ author: { departmentId: v.departmentId } }] : []),
        ],
      });
    }
    if (before) and.push({ createdAt: { lt: new Date(before) } });
    // Pinned posts lead the first page only.
    const pinned = before
      ? []
      : await this.prisma.db.post.findMany({
          where: { ...where, pinned: true },
          include: postInclude,
          orderBy: { createdAt: 'desc' },
          take: 3,
        });
    const rows = await this.prisma.db.post.findMany({
      where: { ...where, ...(pinned.length ? { id: { notIn: pinned.map((p) => p.id) } } : {}) },
      include: postInclude,
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    const posts = [...pinned, ...page];
    return {
      posts: await this.present(posts, v),
      nextBefore: rows.length > PAGE ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  }

  private async present(rows: PostRow[], v: Viewer) {
    const ids = rows.map((p) => p.id);
    const [mine, rsvps, myRsvps] = await Promise.all([
      v.self
        ? this.prisma.db.postReaction.findMany({
            where: { postId: { in: ids }, employeeId: v.self },
            select: { postId: true },
          })
        : [],
      this.prisma.db.eventRsvp.groupBy({
        by: ['postId', 'answer'],
        where: { postId: { in: ids } },
        _count: true,
      }),
      v.self
        ? this.prisma.db.eventRsvp.findMany({
            where: { postId: { in: ids }, employeeId: v.self },
            select: { postId: true, answer: true },
          })
        : [],
    ]);
    const liked = new Set(mine.map((r) => r.postId));
    const count = (postId: string, answer: string) =>
      rsvps.find((r) => r.postId === postId && r.answer === answer)?._count ?? 0;
    return rows.map((p) => ({
      id: p.id,
      kind: p.kind,
      body: p.body,
      author: p.author,
      department: p.department,
      pinned: p.pinned,
      createdAt: p.createdAt.toISOString(),
      kudos: p.kudos ? { value: p.kudos.value, to: p.kudos.to } : null,
      event:
        p.kind === 'EVENT' && p.eventTitle && p.eventStartsAt
          ? {
              title: p.eventTitle,
              startsAt: p.eventStartsAt.toISOString(),
              endsAt: p.eventEndsAt?.toISOString() ?? null,
              location: p.eventLocation,
              going: count(p.id, 'GOING'),
              maybe: count(p.id, 'MAYBE'),
              mine: myRsvps.find((r) => r.postId === p.id)?.answer ?? null,
            }
          : null,
      reactions: p._count.reactions,
      comments: p._count.comments,
      liked: liked.has(p.id),
      canDelete: v.manage || p.authorId === v.self,
    }));
  }

  async createPost(input: PostInput) {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    if ((input.kind === 'ANNOUNCEMENT' || input.kind === 'EVENT') && !v.manage)
      throw new ForbiddenException('Only HR posts announcements and events');
    if (input.departmentId) {
      const d = await this.prisma.db.department.findUnique({ where: { id: input.departmentId } });
      if (!d) throw new NotFoundException('Department not found');
      if (!v.manage && input.departmentId !== v.departmentId)
        throw new ForbiddenException('You can post to everyone or to your own department');
    }
    const event = input.kind === 'EVENT';
    const post = await this.prisma.db.post.create({
      data: {
        tenantId: requireTenantId(),
        authorId: self,
        kind: input.kind,
        body: input.body,
        departmentId: input.departmentId ?? null,
        eventTitle: event ? input.eventTitle : null,
        eventStartsAt: event && input.eventStartsAt ? new Date(input.eventStartsAt) : null,
        eventEndsAt: event && input.eventEndsAt ? new Date(input.eventEndsAt) : null,
        eventLocation: event ? (input.eventLocation ?? null) : null,
      },
      include: postInclude,
    });
    await this.audit.record('engagement.posted', 'Post', post.id, { kind: post.kind });
    return (await this.present([post], v))[0];
  }

  async deletePost(id: string) {
    const v = await this.viewer();
    const post = await this.visiblePost(id, v);
    if (!v.manage && post.authorId !== v.self)
      throw new ForbiddenException('You can remove your own posts');
    await this.prisma.db.post.delete({ where: { id } });
    await this.audit.record('engagement.post_removed', 'Post', id, { kind: post.kind });
  }

  async pin(id: string, pinned: boolean) {
    const v = await this.viewer();
    await this.visiblePost(id, v);
    await this.prisma.db.post.update({ where: { id }, data: { pinned } });
    return { pinned };
  }

  async toggleReaction(id: string) {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    await this.visiblePost(id, v);
    const existing = await this.prisma.db.postReaction.findUnique({
      where: { postId_employeeId: { postId: id, employeeId: self } },
    });
    if (existing) await this.prisma.db.postReaction.delete({ where: { id: existing.id } });
    else
      await this.prisma.db.postReaction.create({
        data: { tenantId: requireTenantId(), postId: id, employeeId: self },
      });
    const reactions = await this.prisma.db.postReaction.count({ where: { postId: id } });
    return { liked: !existing, reactions };
  }

  async comments(id: string) {
    const v = await this.viewer();
    await this.visiblePost(id, v);
    const rows = await this.prisma.db.postComment.findMany({
      where: { postId: id },
      include: { author: person },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      canDelete: v.manage || c.authorId === v.self,
    }));
  }

  async comment(id: string, body: string) {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    await this.visiblePost(id, v);
    const c = await this.prisma.db.postComment.create({
      data: { tenantId: requireTenantId(), postId: id, authorId: self, body },
      include: { author: person },
    });
    return {
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      canDelete: true,
    };
  }

  async deleteComment(postId: string, commentId: string) {
    const v = await this.viewer();
    const c = await this.prisma.db.postComment.findFirst({ where: { id: commentId, postId } });
    if (!c) throw new NotFoundException('Comment not found');
    if (!v.manage && c.authorId !== v.self)
      throw new ForbiddenException('You can remove your own comments');
    await this.prisma.db.postComment.delete({ where: { id: commentId } });
  }

  async rsvp(id: string, answer: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    const post = await this.visiblePost(id, v);
    if (post.kind !== 'EVENT') throw new BadRequestException('This post is not an event');
    await this.prisma.db.eventRsvp.upsert({
      where: { postId_employeeId: { postId: id, employeeId: self } },
      create: { tenantId: requireTenantId(), postId: id, employeeId: self, answer },
      update: { answer },
    });
    const counts = await this.prisma.db.eventRsvp.groupBy({
      by: ['answer'],
      where: { postId: id },
      _count: true,
    });
    const n = (a: string) => counts.find((c) => c.answer === a)?._count ?? 0;
    return { mine: answer, going: n('GOING'), maybe: n('MAYBE') };
  }

  // ---------- side panel: pulse, poll, celebrations, trending ----------

  async sidebar() {
    const v = await this.viewer();
    const [pulse, poll, celebrations, trending] = await Promise.all([
      this.pulseSummary(v),
      this.currentPoll(v),
      this.celebrations(),
      this.trending(v),
    ]);
    return { pulse, poll, celebrations, trending, canManage: v.manage, selfEmployeeId: v.self };
  }

  private async pulseSummary(v: Viewer) {
    const survey =
      (await this.prisma.db.pulseSurvey.findFirst({ where: { active: true } })) ??
      (await this.prisma.db.pulseSurvey.findFirst({ orderBy: { createdAt: 'desc' } }));
    if (!survey) return null;
    const [responses, answered, invited] = await Promise.all([
      this.prisma.db.pulseResponse.findMany({ where: { surveyId: survey.id } }),
      v.self
        ? this.prisma.db.pulseParticipant.findUnique({
            where: { surveyId_employeeId: { surveyId: survey.id, employeeId: v.self } },
          })
        : null,
      this.prisma.db.employee.count({ where: { status: { not: 'EXITED' } } }),
    ]);
    const n = responses.length;
    const pct = (k: 'recognised' | 'managerSupport' | 'workloadFair') =>
      Math.round((responses.filter((r) => r[k]).length / n) * 100);
    const shown = n >= PULSE_MIN_RESPONSES;
    return {
      id: survey.id,
      name: survey.name,
      closesOn: isoDay(survey.closesOn),
      active: survey.active && isoDay(survey.closesOn) >= todayIst(),
      replies: n,
      invited,
      answered: Boolean(answered),
      minResponses: PULSE_MIN_RESPONSES,
      score: shown ? Math.round((responses.reduce((s, r) => s + r.score, 0) / n) * 10) / 10 : null,
      items: shown
        ? [
            { label: 'Feel recognised', pct: pct('recognised') },
            { label: 'Manager support', pct: pct('managerSupport') },
            { label: 'Workload is fair', pct: pct('workloadFair') },
          ]
        : [],
      comments:
        shown && v.manage
          ? responses
              .filter((r) => r.comment)
              .map((r) => r.comment as string)
              .slice(0, 20)
          : [],
    };
  }

  private async currentPoll(v: Viewer) {
    const poll = await this.prisma.db.poll.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        options: { orderBy: { position: 'asc' }, include: { _count: { select: { votes: true } } } },
      },
    });
    if (!poll) return null;
    const total = poll.options.reduce((n, o) => n + o._count.votes, 0);
    const mine = v.self
      ? await this.prisma.db.pollVote.findUnique({
          where: { pollId_employeeId: { pollId: poll.id, employeeId: v.self } },
        })
      : null;
    return {
      id: poll.id,
      question: poll.question,
      closesOn: isoDay(poll.closesOn),
      open: isoDay(poll.closesOn) >= todayIst(),
      votes: total,
      voted: mine?.optionId ?? null,
      options: poll.options.map((o) => ({
        id: o.id,
        label: o.label,
        votes: o._count.votes,
        pct: total ? Math.round((o._count.votes / total) * 100) : 0,
      })),
    };
  }

  /** Birthdays and work anniversaries in the next 7 days, and people who joined in the last 7. */
  async celebrations() {
    const today = todayIst();
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const md = (d: Date) => isoDay(d).slice(5);
    const when = (iso: string) =>
      iso === today
        ? 'Today'
        : new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
            weekday: 'short',
            timeZone: 'UTC',
          });
    const nextDay = (date: Date) => week.find((d) => d.slice(5) === md(date));
    const people = await this.prisma.db.employee.findMany({
      where: { status: { not: 'EXITED' } },
      select: { ...person.select, dateOfJoining: true, profile: { select: { dateOfBirth: true } } },
    });
    const out: {
      kind: 'BIRTHDAY' | 'ANNIVERSARY' | 'JOINED';
      employee: (typeof people)[number];
      on: string;
      caption: string;
    }[] = [];
    for (const e of people) {
      const dob = e.profile?.dateOfBirth;
      const birthday = dob && nextDay(dob);
      if (birthday)
        out.push({
          kind: 'BIRTHDAY',
          employee: e,
          on: birthday,
          caption: `Birthday · ${when(birthday)}`,
        });
      const joined = isoDay(e.dateOfJoining);
      const anniversary = nextDay(e.dateOfJoining);
      const years = anniversary ? Number(anniversary.slice(0, 4)) - Number(joined.slice(0, 4)) : 0;
      if (anniversary && years >= 1)
        out.push({
          kind: 'ANNIVERSARY',
          employee: e,
          on: anniversary,
          caption: `${years} ${years === 1 ? 'year' : 'years'} with us · ${when(anniversary)}`,
        });
      if (joined <= today && joined > addDays(today, -7))
        out.push({
          kind: 'JOINED',
          employee: e,
          on: joined,
          caption: joined === today ? 'Joins today' : 'Joined this week',
        });
    }
    return out
      .sort((a, b) => a.on.localeCompare(b.on))
      .slice(0, 8)
      .map(({ employee: { dateOfJoining: _j, profile: _p, ...employee }, ...c }) => ({
        ...c,
        employee,
      }));
  }

  private async trending(v: Viewer) {
    const posts = await this.prisma.db.post.findMany({
      where: { ...this.audience(v), createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      select: { body: true },
      take: 500,
    });
    const tally = new Map<string, { tag: string; n: number }>();
    for (const p of posts)
      for (const m of p.body.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)) {
        const key = m[1]!.toLowerCase();
        const t = tally.get(key) ?? { tag: `#${m[1]}`, n: 0 };
        t.n += 1;
        tally.set(key, t);
      }
    return [...tally.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((t) => t.tag);
  }

  // ---------- polls ----------

  async createPoll(input: PollInput) {
    const v = await this.viewer();
    if (input.closesOn < todayIst())
      throw new BadRequestException('Pick a closing date from today on');
    const labels = input.options.map((o) => o.trim());
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length)
      throw new BadRequestException('Each option must be different');
    const tenantId = requireTenantId();
    const poll = await this.prisma.db.poll.create({
      data: {
        tenantId,
        question: input.question,
        closesOn: toDate(input.closesOn),
        createdById: v.self,
        options: { create: labels.map((label, position) => ({ tenantId, label, position })) },
      },
    });
    await this.audit.record('engagement.poll_created', 'Poll', poll.id, {
      question: poll.question,
    });
    return this.currentPoll(v);
  }

  async vote(pollId: string, optionId: string) {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    const poll = await this.prisma.db.poll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (isoDay(poll.closesOn) < todayIst()) throw new BadRequestException('This poll has closed');
    const option = await this.prisma.db.pollOption.findFirst({ where: { id: optionId, pollId } });
    if (!option) throw new NotFoundException('Option not found');
    await this.prisma.db.pollVote.upsert({
      where: { pollId_employeeId: { pollId, employeeId: self } },
      create: { tenantId: requireTenantId(), pollId, optionId, employeeId: self },
      update: { optionId },
    });
    return this.currentPoll(v);
  }

  // ---------- pulse surveys ----------

  async startPulse(input: PulseSurveyInput) {
    if (input.closesOn < todayIst())
      throw new BadRequestException('Pick a closing date from today on');
    // Close any survey whose date has passed so a new one can start.
    await this.prisma.db.pulseSurvey.updateMany({
      where: { active: true, closesOn: { lt: toDate(todayIst()) } },
      data: { active: false },
    });
    const open = await this.prisma.db.pulseSurvey.findFirst({ where: { active: true } });
    if (open) throw new ConflictException(`${open.name} is still open. Close it first.`);
    const s = await this.prisma.db.pulseSurvey.create({
      data: { tenantId: requireTenantId(), name: input.name, closesOn: toDate(input.closesOn) },
    });
    await this.audit.record('engagement.pulse_started', 'PulseSurvey', s.id, { name: s.name });
    return this.pulseSummary(await this.viewer());
  }

  async closePulse(id: string) {
    const s = await this.prisma.db.pulseSurvey.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Survey not found');
    await this.prisma.db.pulseSurvey.update({ where: { id }, data: { active: false } });
    return this.pulseSummary(await this.viewer());
  }

  async respond(id: string, input: PulseResponseInput) {
    const v = await this.viewer();
    const self = this.requireSelf(v);
    const s = await this.prisma.db.pulseSurvey.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Survey not found');
    if (!s.active || isoDay(s.closesOn) < todayIst())
      throw new BadRequestException('This survey has closed');
    const tenantId = requireTenantId();
    try {
      await this.prisma.db.$transaction([
        this.prisma.db.pulseParticipant.create({
          data: { tenantId, surveyId: id, employeeId: self },
        }),
        this.prisma.db.pulseResponse.create({
          data: {
            tenantId,
            surveyId: id,
            score: input.score,
            recognised: input.recognised,
            managerSupport: input.managerSupport,
            workloadFair: input.workloadFair,
            comment: input.comment || null,
          },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('You have already answered this survey');
      throw err;
    }
    return this.pulseSummary(v);
  }
}
