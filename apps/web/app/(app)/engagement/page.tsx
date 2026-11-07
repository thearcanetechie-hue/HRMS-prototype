'use client';

import {
  Award,
  BarChart3,
  CalendarDays,
  Globe,
  Loader2,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Send,
  Star,
  ThumbsUp,
  Trash2,
  Trophy,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import {
  api,
  ApiError,
  type Celebration,
  type Employee,
  type EngagementSidebar,
  type FeedComment,
  type FeedPage,
  type FeedPerson,
  type FeedPost,
  type Named,
  type Paged,
  type PollSummary,
  type PulseSummary,
} from '@/lib/api';
import { initials } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const CELEBRATION: Record<Celebration['kind'], [LucideIcon, Tone, string]> = {
  BIRTHDAY: [Star, 'primary', 'Happy birthday'],
  ANNIVERSARY: [Award, 'detail', 'Happy work anniversary'],
  JOINED: [UserPlus, 'success', 'Welcome to the team'],
};
const KIND: Record<FeedPost['kind'], [string, BadgeTone] | null> = {
  UPDATE: null,
  WIN: ['Win', 'success'],
  ANNOUNCEMENT: ['Announcement', 'accent'],
  KUDOS: ['Kudos', 'warning'],
  EVENT: ['Event', 'info'],
};
const VALUES = [
  'Ownership',
  'Teamwork',
  'Customer first',
  'Quality',
  'Helping others',
  'Going the extra mile',
];
type Tab = 'all' | 'announcements' | 'kudos' | 'team';

const nameOf = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();
const avatarOf = (p: { firstName: string; lastName: string }) => initials(p.firstName, p.lastName);
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const role = (p: FeedPerson) =>
  [p.designation?.name, p.department?.name].filter(Boolean).join(', ');

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  if (s < 2 * 86_400) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Post text with #hashtags picked out. */
function Body({ text }: { text: string }) {
  return (
    <p className="max-w-[600px] leading-[1.55] whitespace-pre-wrap">
      {text.split(/(#[\p{L}\p{N}_]{2,40})/u).map((part, i) =>
        part.startsWith('#') ? (
          <span key={i} className="font-semibold text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

type Dialogs =
  | { kind: 'post'; preset?: Partial<{ kind: string; body: string }> }
  | { kind: 'kudos'; toId?: string }
  | { kind: 'poll' }
  | { kind: 'pulse-start' }
  | { kind: 'pulse-answer'; pulse: PulseSummary }
  | null;

export default function EngagementPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [feed, setFeed] = useState<FeedPage | null>(null);
  const [side, setSide] = useState<EngagementSidebar | null>(null);
  const [error, setError] = useState('');
  const [moreBusy, setMoreBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [toast, showToast] = useToast();

  const loadFeed = useCallback(async (t: Tab) => {
    try {
      setFeed(await api<FeedPage>(`/engagement/feed?tab=${t}`));
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load the feed.'));
    }
  }, []);
  const loadSide = useCallback(() => {
    api<EngagementSidebar>('/engagement/sidebar')
      .then(setSide)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    void loadFeed(tab);
  }, [tab, loadFeed]);
  useEffect(loadSide, [loadSide]);

  const manage = side?.canManage ?? false;
  const done = (message: string) => {
    setDialog(null);
    showToast(message);
    void loadFeed(tab);
    loadSide();
  };
  const patch = (id: string, change: Partial<FeedPost> | null) =>
    setFeed(
      (f) =>
        f && {
          ...f,
          posts: change
            ? f.posts.map((p) => (p.id === id ? { ...p, ...change } : p))
            : f.posts.filter((p) => p.id !== id),
        },
    );

  async function loadMore() {
    if (!feed?.nextBefore) return;
    setMoreBusy(true);
    try {
      const next = await api<FeedPage>(
        `/engagement/feed?tab=${tab}&before=${encodeURIComponent(feed.nextBefore)}`,
      );
      setFeed({ posts: [...feed.posts, ...next.posts], nextBefore: next.nextBefore });
    } finally {
      setMoreBusy(false);
    }
  }

  const composer: [LucideIcon, string, string, () => void][] = [
    [Trophy, 'Win', 'text-success', () => setDialog({ kind: 'post', preset: { kind: 'WIN' } })],
    [Award, 'Kudos', 'text-warning', () => setDialog({ kind: 'kudos' })],
    ...(manage
      ? ([
          [BarChart3, 'Poll', 'text-info', () => setDialog({ kind: 'poll' })],
          [
            CalendarDays,
            'Event',
            'text-primary',
            () => setDialog({ kind: 'post', preset: { kind: 'EVENT' } }),
          ],
        ] as [LucideIcon, string, string, () => void][])
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Engagement"
        description="Wins, thank-yous and news from across the company."
        actions={
          <>
            {manage && !side?.pulse?.active && (
              <Button onClick={() => setDialog({ kind: 'pulse-start' })}>
                <BarChart3 /> Pulse survey
              </Button>
            )}
            <Button variant="primary" onClick={() => setDialog({ kind: 'post' })}>
              <Pencil /> New post
            </Button>
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="grid gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                initials={me.user.fullName
                  .split(/\s+/)
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              />
              <button
                type="button"
                onClick={() => setDialog({ kind: 'post' })}
                className="h-11 grow cursor-pointer rounded-full bg-surface-2 px-5 text-left text-muted-foreground shadow-inset-sm"
              >
                Share an update, a win or a thank-you
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {composer.map(([Icon, label, color, onClick]) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Icon className={cn('size-4', color)} /> {label}
                </button>
              ))}
              <Chip className="ml-auto" onClick={() => setDialog({ kind: 'post' })}>
                <Globe /> Everyone
              </Chip>
            </div>
          </Card>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="all">For you</TabsTrigger>
              <TabsTrigger value="announcements">Announcements</TabsTrigger>
              <TabsTrigger value="kudos">Kudos</TabsTrigger>
              <TabsTrigger value="team">My team</TabsTrigger>
            </TabsList>
          </Tabs>

          {!feed ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : feed.posts.length === 0 ? (
            <Card className="grid justify-items-center gap-3">
              <Empty className="pb-0">Nothing here yet. Be the first to post.</Empty>
              <Button onClick={() => setDialog({ kind: 'post' })}>
                <Pencil /> New post
              </Button>
            </Card>
          ) : (
            <>
              {feed.posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  manage={manage}
                  onPatch={(c) => patch(p.id, c)}
                  onKudos={(toId) => setDialog({ kind: 'kudos', toId })}
                  onToast={showToast}
                />
              ))}
              {feed.nextBefore && (
                <Button className="justify-self-center" disabled={moreBusy} onClick={loadMore}>
                  {moreBusy && <Loader2 className="animate-spin" />} Show older posts
                </Button>
              )}
            </>
          )}
        </div>

        <div className="grid content-start gap-5">
          <PulseCard
            pulse={side?.pulse ?? null}
            loading={!side}
            manage={manage}
            onAnswer={(pulse) => setDialog({ kind: 'pulse-answer', pulse })}
            onStart={() => setDialog({ kind: 'pulse-start' })}
            onClosed={() => done('Survey closed')}
          />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Celebrations</CardTitle>
                <CardDescription>This week</CardDescription>
              </div>
            </CardHeader>
            {side?.celebrations.length ? (
              <ul className="grid gap-3.5">
                {side.celebrations.map((c) => {
                  const [Icon, tone, wish] = CELEBRATION[c.kind];
                  return (
                    <li key={c.kind + c.employee.id} className="flex items-center gap-3">
                      <IconTile tone={tone} size={36}>
                        <Icon />
                      </IconTile>
                      <div className="min-w-0 grow">
                        <div className="font-semibold">{nameOf(c.employee)}</div>
                        <div className="text-xs text-muted-foreground">{c.caption}</div>
                      </div>
                      {c.employee.id !== side.selfEmployeeId && (
                        <Chip
                          className="h-8 px-3 text-xs"
                          onClick={() =>
                            setDialog({
                              kind: 'post',
                              preset: { body: `${wish}, ${c.employee.firstName}! 🎉` },
                            })
                          }
                        >
                          Wish
                        </Chip>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {side ? 'No birthdays, anniversaries or new joiners this week.' : 'Loading…'}
              </p>
            )}
          </Card>

          <PollCard
            poll={side?.poll ?? null}
            manage={manage}
            onVoted={(poll) => setSide((s) => s && { ...s, poll })}
            onNew={() => setDialog({ kind: 'poll' })}
            onError={showToast}
          />

          {side && side.trending.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Trending</CardTitle>
                  <CardDescription>Hashtags in the last 30 days</CardDescription>
                </div>
              </CardHeader>
              <div className="flex flex-wrap gap-2">
                {side.trending.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary/8 px-3 py-1.5 text-[13px] font-semibold text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'post' && (
          <NewPost
            preset={dialog.preset}
            manage={manage}
            myDepartmentId={side?.departmentId ?? null}
            onDone={done}
          />
        )}
        {dialog?.kind === 'kudos' && (
          <KudosDialog toId={dialog.toId} selfId={side?.selfEmployeeId ?? null} onDone={done} />
        )}
        {dialog?.kind === 'poll' && <PollDialog onDone={done} />}
        {dialog?.kind === 'pulse-start' && <PulseStartDialog onDone={done} />}
        {dialog?.kind === 'pulse-answer' && (
          <PulseAnswerDialog pulse={dialog.pulse} onDone={done} />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function PostCard({
  post: p,
  manage,
  onPatch,
  onKudos,
  onToast,
}: {
  post: FeedPost;
  manage: boolean;
  onPatch: (change: Partial<FeedPost> | null) => void;
  onKudos: (toId: string) => void;
  onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const tag = KIND[p.kind];

  useEffect(() => {
    if (open && !comments)
      api<FeedComment[]>(`/engagement/posts/${p.id}/comments`)
        .then(setComments)
        .catch(() => setComments([]));
  }, [open, comments, p.id]);

  async function like() {
    try {
      onPatch(
        await api<{ liked: boolean; reactions: number }>(`/engagement/posts/${p.id}/react`, {
          method: 'POST',
        }),
      );
    } catch (err) {
      onToast(errorText(err, 'Could not like this post'));
    }
  }
  async function rsvp(answer: 'GOING' | 'MAYBE' | 'NOT_GOING') {
    try {
      const r = await api<{ mine: typeof answer; going: number; maybe: number }>(
        `/engagement/posts/${p.id}/rsvp`,
        {
          method: 'POST',
          body: JSON.stringify({ answer }),
        },
      );
      if (p.event) onPatch({ event: { ...p.event, ...r } });
    } catch (err) {
      onToast(errorText(err, 'Could not save your answer'));
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      const c = await api<FeedComment>(`/engagement/posts/${p.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      });
      setComments((cs) => [...(cs ?? []), c]);
      setDraft('');
      onPatch({ comments: p.comments + 1 });
    } catch (err) {
      onToast(errorText(err, 'Could not post your comment'));
    }
  }

  const when = p.event ? new Date(p.event.startsAt) : null;
  return (
    <Card className="grid gap-4 sm:p-[22px]">
      <div className="flex items-start gap-3">
        <Avatar initials={avatarOf(p.author)} />
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{nameOf(p.author)}</span>
            {tag && <Badge tone={tag[1]}>{tag[0]}</Badge>}
            {p.pinned && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Pin className="size-3" /> Pinned
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {[role(p.author), ago(p.createdAt), p.department ? `${p.department.name} only` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {manage && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={p.pinned ? 'Unpin' : 'Pin to top'}
            onClick={async () => {
              await api(`/engagement/posts/${p.id}/pin`, {
                method: 'POST',
                body: JSON.stringify({ pinned: !p.pinned }),
              });
              onPatch({ pinned: !p.pinned });
            }}
          >
            {p.pinned ? <PinOff /> : <Pin />}
          </Button>
        )}
        {p.canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove post"
            onClick={async () => {
              if (!window.confirm('Remove this post?')) return;
              try {
                await api(`/engagement/posts/${p.id}`, { method: 'DELETE' });
                onPatch(null);
                onToast('Post removed');
              } catch (err) {
                onToast(errorText(err, 'Could not remove it'));
              }
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <Body text={p.body} />

      {p.event && when && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2/70 p-4">
          <div className="grid size-14 place-items-center content-center rounded-[14px] bg-primary leading-tight text-primary-foreground shadow-glow">
            <span className="text-[11px] font-bold uppercase">
              {when.toLocaleDateString('en-IN', { month: 'short' })}
            </span>
            <span className="text-xl font-extrabold">{when.getDate()}</span>
          </div>
          <div className="min-w-0 grow">
            <div className="font-bold">{p.event.title}</div>
            <div className="text-[13px] text-muted-foreground">
              {when.toLocaleDateString('en-IN', { weekday: 'long' })} ·{' '}
              {when.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
              {p.event.endsAt &&
                ` – ${new Date(p.event.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
              {p.event.location && ` · ${p.event.location}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.event.going} going · {p.event.maybe} maybe
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={p.event.mine === 'GOING' ? 'primary' : 'default'}
              onClick={() => rsvp(p.event!.mine === 'GOING' ? 'NOT_GOING' : 'GOING')}
            >
              {p.event.mine === 'GOING' ? 'Going ✓' : 'Going'}
            </Button>
            <Button
              size="sm"
              variant={p.event.mine === 'MAYBE' ? 'primary' : 'default'}
              onClick={() => rsvp(p.event!.mine === 'MAYBE' ? 'NOT_GOING' : 'MAYBE')}
            >
              Maybe
            </Button>
          </div>
        </div>
      )}
      {p.kudos && (
        <div className="flex items-center gap-4 rounded-2xl bg-warning/10 p-4">
          <IconTile tone="warning" size={44}>
            <Award />
          </IconTile>
          <div className="grow">
            <div className="text-xs font-bold tracking-[0.12em] text-warning uppercase">
              Kudos · {p.kudos.value}
            </div>
            <div className="text-lg font-extrabold">{nameOf(p.kudos.to)}</div>
          </div>
          <Avatar initials={avatarOf(p.kudos.to)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="grid size-[22px] place-items-center rounded-full bg-info text-surface ring-2 ring-surface">
            <ThumbsUp className="size-3" />
          </span>
          {p.reactions} {p.reactions === 1 ? 'like' : 'likes'}
        </span>
        <button
          type="button"
          className="cursor-pointer hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          {p.comments} {p.comments === 1 ? 'comment' : 'comments'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            [ThumbsUp, p.liked ? 'Liked' : 'Like', like, p.liked],
            [MessageCircle, 'Comment', () => setOpen(true), false],
            [Award, 'Kudos', () => onKudos(p.kudos?.to.id ?? p.author.id), false],
          ] as const
        ).map(([Icon, label, onClick, on]) => (
          <button
            key={label}
            type="button"
            aria-pressed={label.startsWith('Like') ? on : undefined}
            onClick={onClick}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-surface-2/60 text-[13px] font-semibold hover:bg-surface-2',
              on ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="grid gap-3 border-t border-border/60 pt-4">
          {!comments ? (
            <Skeleton className="h-10" />
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar initials={avatarOf(c.author)} className="size-[30px] text-[11px]" />
                <div className="min-w-0 grow rounded-2xl bg-surface-2/60 px-3.5 py-2.5">
                  <div className="text-[13px] font-bold">
                    {nameOf(c.author)}{' '}
                    <span className="font-normal text-muted-foreground">· {ago(c.createdAt)}</span>
                  </div>
                  <p className="text-[13.5px] whitespace-pre-wrap">{c.body}</p>
                </div>
                {c.canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove comment"
                    onClick={async () => {
                      await api(`/engagement/posts/${p.id}/comments/${c.id}`, { method: 'DELETE' });
                      setComments((cs) => cs?.filter((x) => x.id !== c.id) ?? null);
                      onPatch({ comments: Math.max(0, p.comments - 1) });
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))
          )}
          <form onSubmit={send} className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment"
              aria-label="Write a comment"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              aria-label="Send comment"
              disabled={!draft.trim()}
            >
              <Send />
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

function PulseCard({
  pulse,
  loading,
  manage,
  onAnswer,
  onStart,
  onClosed,
}: {
  pulse: PulseSummary | null;
  loading: boolean;
  manage: boolean;
  onAnswer: (p: PulseSummary) => void;
  onStart: () => void;
  onClosed: () => void;
}) {
  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!pulse)
    return (
      <Card className="grid justify-items-center gap-3 text-center">
        <CardTitle>Team pulse</CardTitle>
        <p className="text-muted-foreground">
          A short anonymous survey on how people feel about recognition, support and workload.
        </p>
        {manage && (
          <Button size="sm" onClick={onStart}>
            <BarChart3 /> Start a pulse survey
          </Button>
        )}
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Team pulse</CardTitle>
          <CardDescription>
            {pulse.name} · {pulse.replies} of {pulse.invited} answered
          </CardDescription>
        </div>
        {pulse.active ? <Badge tone="accent">Open</Badge> : <Badge>Closed</Badge>}
      </CardHeader>
      {pulse.score != null ? (
        <>
          <div className="mb-5 flex justify-center">
            <ProgressRing
              value={pulse.score * 10}
              label="Pulse score"
              display={`${pulse.score}`}
              caption="of 10"
            />
          </div>
          <ul className="mb-4 grid gap-3.5">
            {pulse.items.map((i) => (
              <li key={i.label} className="grid gap-1.5">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{i.label}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">{i.pct}%</span>
                </div>
                <ProgressBar value={i.pct} tone={i.pct < 70 ? 'warning' : 'primary'} />
              </li>
            ))}
          </ul>
          {pulse.comments.length > 0 && (
            <details className="mb-4 text-[13px]">
              <summary className="cursor-pointer font-semibold">
                Comments ({pulse.comments.length})
              </summary>
              <ul className="mt-2 grid gap-2 text-muted-foreground">
                {pulse.comments.map((c, i) => (
                  <li key={i} className="rounded-xl bg-surface-2/60 px-3 py-2">
                    “{c}”
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="mb-4 text-[13.5px] text-muted-foreground">
          Results show once {pulse.minResponses} people have answered, so no one can be singled out.
        </p>
      )}
      <div className="grid gap-2">
        {pulse.active && !pulse.answered && (
          <Button variant="primary" onClick={() => onAnswer(pulse)}>
            Answer the survey
          </Button>
        )}
        {pulse.active && pulse.answered && (
          <p className="text-center text-[13px] font-semibold text-success">
            Thanks, your answer is in.
          </p>
        )}
        {manage && pulse.active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!window.confirm(`Close ${pulse.name}? People won't be able to answer any more.`))
                return;
              await api(`/engagement/pulse/${pulse.id}/close`, { method: 'POST' });
              onClosed();
            }}
          >
            Close survey
          </Button>
        )}
        {manage && !pulse.active && (
          <Button size="sm" onClick={onStart}>
            <BarChart3 /> Start a new survey
          </Button>
        )}
      </div>
    </Card>
  );
}

function PollCard({
  poll,
  manage,
  onVoted,
  onNew,
  onError,
}: {
  poll: PollSummary | null;
  manage: boolean;
  onVoted: (p: PollSummary) => void;
  onNew: () => void;
  onError: (m: string) => void;
}) {
  if (!poll && !manage) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Poll</CardTitle>
          {poll && (
            <CardDescription>
              {poll.open
                ? `Closes ${new Date(`${poll.closesOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : 'Closed'}{' '}
              · {poll.votes} {poll.votes === 1 ? 'vote' : 'votes'}
            </CardDescription>
          )}
        </div>
        {manage && (
          <Button size="sm" variant="ghost" onClick={onNew}>
            New poll
          </Button>
        )}
      </CardHeader>
      {poll ? (
        <>
          <p className="mb-3 font-semibold">{poll.question}</p>
          <ul className="grid gap-2" role="radiogroup" aria-label={poll.question}>
            {poll.options.map((o) => {
              const on = poll.voted === o.id;
              const show = Boolean(poll.voted) || !poll.open;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!poll.open}
                    onClick={async () => {
                      try {
                        onVoted(
                          await api<PollSummary>(`/engagement/polls/${poll.id}/vote`, {
                            method: 'POST',
                            body: JSON.stringify({ optionId: o.id }),
                          }),
                        );
                      } catch (err) {
                        onError(errorText(err, 'Could not save your vote'));
                      }
                    }}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-xl px-3.5 py-2.5 text-left font-semibold disabled:cursor-default',
                      on ? 'bg-primary/10 text-primary' : 'bg-surface-2/70',
                    )}
                  >
                    {show && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 bg-primary/8"
                        style={{ width: `${o.pct}%` }}
                      />
                    )}
                    <span className="relative">{o.label}</span>
                    {show && <span className="relative font-mono text-[13px]">{o.pct}%</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!poll.voted && poll.open && (
            <p className="mt-2 text-xs text-muted-foreground">
              Results show after you vote. Votes are not shown by name.
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No polls yet.</p>
      )}
    </Card>
  );
}

function usePeople() {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => e.status !== 'EXITED')
            .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
        ),
      )
      .catch(() => undefined);
  }, []);
  return people;
}

function Actions({ busy, label }: { busy?: boolean; label: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Button variant="primary" type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {label}
      </Button>
      <DialogClose asChild>
        <Button type="button">Cancel</Button>
      </DialogClose>
    </div>
  );
}

function NewPost({
  preset,
  manage,
  myDepartmentId,
  onDone,
}: {
  preset?: Partial<{ kind: string; body: string }>;
  manage: boolean;
  myDepartmentId: string | null;
  onDone: (m: string) => void;
}) {
  const [kind, setKind] = useState(preset?.kind ?? 'UPDATE');
  const [body, setBody] = useState(preset?.body ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Named[]>([]);
  const [event, setEvent] = useState({ title: '', date: '', from: '12:30', to: '', location: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (manage)
      api<Named[]>('/org/departments')
        .then(setDepartments)
        .catch(() => undefined);
  }, [manage]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const at = (t: string) =>
      event.date && t ? new Date(`${event.date}T${t}:00`).toISOString() : null;
    try {
      await api('/engagement/posts', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          body,
          departmentId: departmentId || null,
          ...(kind === 'EVENT'
            ? {
                eventTitle: event.title,
                eventStartsAt: at(event.from),
                eventEndsAt: at(event.to),
                eventLocation: event.location || null,
              }
            : {}),
        }),
      });
      onDone('Posted');
    } catch (err) {
      setError(errorText(err, 'Could not post'));
      setBusy(false);
    }
  }

  return (
    <DialogContent title={kind === 'EVENT' ? 'New event' : 'New post'} aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted-foreground">What’s new?</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            required
            placeholder="Share an update, a win or a thank-you. Add #hashtags so people can find it."
            className="w-full rounded-xl bg-surface-2 p-3.5 text-sm shadow-inset-sm outline-none focus-visible:outline-2 focus-visible:outline-ring/60"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="np-kind" label="Type">
            <Select id="np-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="UPDATE">Update</option>
              <option value="WIN">Win</option>
              {manage && <option value="ANNOUNCEMENT">Announcement</option>}
              {manage && <option value="EVENT">Event</option>}
            </Select>
          </Field>
          <Field id="np-aud" label="Who sees it">
            <Select
              id="np-aud"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Everyone</option>
              {manage
                ? departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} only
                    </option>
                  ))
                : myDepartmentId && <option value={myDepartmentId}>My department</option>}
            </Select>
          </Field>
        </div>
        {kind === 'EVENT' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ev-title" label="Event name">
              <Input
                id="ev-title"
                value={event.title}
                onChange={(e) => setEvent({ ...event, title: e.target.value })}
                required
              />
            </Field>
            <Field id="ev-date" label="Date">
              <Input
                id="ev-date"
                type="date"
                value={event.date}
                onChange={(e) => setEvent({ ...event, date: e.target.value })}
                required
              />
            </Field>
            <Field id="ev-from" label="Starts">
              <Input
                id="ev-from"
                type="time"
                value={event.from}
                onChange={(e) => setEvent({ ...event, from: e.target.value })}
                required
              />
            </Field>
            <Field id="ev-to" label="Ends (optional)">
              <Input
                id="ev-to"
                type="time"
                value={event.to}
                onChange={(e) => setEvent({ ...event, to: e.target.value })}
              />
            </Field>
            <Field id="ev-loc" label="Where" className="sm:col-span-2">
              <Input
                id="ev-loc"
                value={event.location}
                onChange={(e) => setEvent({ ...event, location: e.target.value })}
                placeholder="Bengaluru office and online"
              />
            </Field>
          </div>
        )}
        <FormError>{error}</FormError>
        <Actions busy={busy} label="Post" />
      </form>
    </DialogContent>
  );
}

function KudosDialog({
  toId,
  selfId,
  onDone,
}: {
  toId?: string;
  selfId: string | null;
  onDone: (m: string) => void;
}) {
  const people = usePeople().filter((p) => p.id !== selfId);
  const [to, setTo] = useState(toId && toId !== selfId ? toId : '');
  const [value, setValue] = useState(VALUES[0]!);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const target = to || people[0]?.id || '';
  return (
    <DialogContent title="Give kudos" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/performance/kudos', {
              method: 'POST',
              body: JSON.stringify({ toId: target, value, reason }),
            });
            onDone('Kudos sent and posted to the feed');
          } catch (err) {
            setError(errorText(err, 'Could not send kudos'));
          }
        }}
      >
        <Field id="k-to" label="To">
          <Select id="k-to" value={target} onChange={(e) => setTo(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {VALUES.map((v) => (
            <Chip key={v} active={value === v} onClick={() => setValue(v)}>
              {v}
            </Chip>
          ))}
        </div>
        <Field id="k-why" label="What for?">
          <Input
            id="k-why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Stayed late to unblock the release"
            required
          />
        </Field>
        <FormError>{error}</FormError>
        <Actions
          label={
            <>
              <Award /> Send kudos
            </>
          }
        />
      </form>
    </DialogContent>
  );
}

function PollDialog({ onDone }: { onDone: (m: string) => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [closesOn, setClosesOn] = useState(() =>
    new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
  );
  const [error, setError] = useState('');
  return (
    <DialogContent title="New poll" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/engagement/polls', {
              method: 'POST',
              body: JSON.stringify({
                question,
                options: options.filter((o) => o.trim()),
                closesOn,
              }),
            });
            onDone('Poll started');
          } catch (err) {
            setError(errorText(err, 'Could not start the poll'));
          }
        }}
      >
        <Field id="p-q" label="Question">
          <Input
            id="p-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Where should the Q4 offsite be?"
            required
          />
        </Field>
        {options.map((o, i) => (
          <Field key={i} id={`p-o${i}`} label={`Option ${i + 1}`}>
            <Input
              id={`p-o${i}`}
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              required={i < 2}
            />
          </Field>
        ))}
        {options.length < 6 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setOptions([...options, ''])}
          >
            Add an option
          </Button>
        )}
        <Field id="p-close" label="Closes on">
          <Input
            id="p-close"
            type="date"
            value={closesOn}
            onChange={(e) => setClosesOn(e.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        <Actions label="Start poll" />
      </form>
    </DialogContent>
  );
}

function PulseStartDialog({ onDone }: { onDone: (m: string) => void }) {
  const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const [name, setName] = useState(`${month} pulse`);
  const [closesOn, setClosesOn] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  );
  const [error, setError] = useState('');
  return (
    <DialogContent title="Start a pulse survey" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/engagement/pulse', {
              method: 'POST',
              body: JSON.stringify({ name, closesOn }),
            });
            onDone(`${name} is open`);
          } catch (err) {
            setError(errorText(err, 'Could not start the survey'));
          }
        }}
      >
        <Field id="ps-name" label="Name">
          <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field id="ps-close" label="Closes on">
          <Input
            id="ps-close"
            type="date"
            value={closesOn}
            onChange={(e) => setClosesOn(e.target.value)}
          />
        </Field>
        <p className="text-[13px] text-muted-foreground">
          Everyone answers four quick questions. Answers are anonymous: they are stored without
          names, and results only show once {3} or more people have answered.
        </p>
        <FormError>{error}</FormError>
        <Actions label="Open survey" />
      </form>
    </DialogContent>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-2">
      <span className="font-semibold">{label}</span>
      <div className="flex gap-2">
        {([true, false] as const).map((v) => (
          <Chip key={String(v)} active={value === v} onClick={() => onChange(v)}>
            {v ? 'Yes' : 'Not really'}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function PulseAnswerDialog({
  pulse,
  onDone,
}: {
  pulse: PulseSummary;
  onDone: (m: string) => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [a, setA] = useState<{
    recognised: boolean | null;
    managerSupport: boolean | null;
    workloadFair: boolean | null;
  }>({
    recognised: null,
    managerSupport: null,
    workloadFair: null,
  });
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const ready =
    score !== null && a.recognised !== null && a.managerSupport !== null && a.workloadFair !== null;
  return (
    <DialogContent title={pulse.name} side="right" aria-describedby={undefined}>
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/engagement/pulse/${pulse.id}/respond`, {
              method: 'POST',
              body: JSON.stringify({ score, ...a, comment: comment || null }),
            });
            onDone('Thanks, your answer is in');
          } catch (err) {
            setError(errorText(err, 'Could not save your answer'));
          }
        }}
      >
        <p className="rounded-2xl bg-surface-2/60 p-3.5 text-[13px] text-muted-foreground">
          Your answers are anonymous. We only record that you took part, not what you said.
        </p>
        <div className="grid gap-2">
          <span className="font-semibold">
            How likely are you to recommend working here to a friend?
          </span>
          <div
            className="grid grid-cols-6 gap-1.5 sm:grid-cols-11"
            role="radiogroup"
            aria-label="Score from 0 to 10"
          >
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                onClick={() => setScore(n)}
                className={cn(
                  'h-10 cursor-pointer rounded-xl text-sm font-bold',
                  score === n
                    ? 'bg-primary text-primary-foreground shadow-glow'
                    : 'bg-surface-2/70',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </div>
        <YesNo
          label="Do you feel recognised for your work?"
          value={a.recognised}
          onChange={(v) => setA({ ...a, recognised: v })}
        />
        <YesNo
          label="Does your manager support you?"
          value={a.managerSupport}
          onChange={(v) => setA({ ...a, managerSupport: v })}
        />
        <YesNo
          label="Is your workload fair?"
          value={a.workloadFair}
          onChange={(v) => setA({ ...a, workloadFair: v })}
        />
        <Field id="pa-c" label="Anything else? (optional)">
          <Input id="pa-c" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!ready}>
            Send answers
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
