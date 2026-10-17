'use client';

import {
  Award,
  BarChart3,
  CalendarDays,
  Globe,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  ThumbsUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/input';
import { DemoBadge, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getEngagementOverview, type EngagementOverview, type Post } from '@/lib/demo/engagement';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const CELEBRATION_ICON = { birthday: Star, anniversary: Award, joined: UserPlus };
const COMPOSER: [LucideIcon, string, string][] = [
  [ImageIcon, 'Photo', 'text-info'],
  [Award, 'Kudos', 'text-warning'],
  [BarChart3, 'Poll', 'text-success'],
  [CalendarDays, 'Event', 'text-primary'],
];

const toInitials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function EngagementPage() {
  const { me } = useSession();
  const [data, setData] = useState<EngagementOverview | null>(null);
  const [tab, setTab] = useState('for-you');
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [rsvp, setRsvp] = useState<Set<string>>(new Set());
  const [vote, setVote] = useState<string | undefined>();
  const [composing, setComposing] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getEngagementOverview().then((d) => {
      setData(d);
      setVote(d.poll.voted);
    });
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="People" title="Engagement" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const posts = data.posts.filter(
    (p) =>
      tab === 'for-you' ||
      (tab === 'announcements' && p.kind === 'announcement') ||
      (tab === 'kudos' && p.kind === 'kudos'),
  );

  function publish(post: Post) {
    setData((d) => d && { ...d, posts: [post, ...d.posts] });
    setComposing(false);
    setTab('for-you');
    showToast('Posted to everyone');
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Engagement <DemoBadge />
          </span>
        }
        description="Wins, thank-yous and news from across the company."
        actions={
          <>
            <Button onClick={() => showToast('Pulse surveys are coming soon')}>
              <BarChart3 /> Pulse survey
            </Button>
            <Button variant="primary" onClick={() => setComposing(true)}>
              <Pencil /> New post
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="grid gap-4">
            <div className="flex items-center gap-3">
              <Avatar initials={toInitials(me.user.fullName)} />
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="h-11 grow cursor-pointer rounded-full bg-surface-2 px-5 text-left text-muted-foreground shadow-inset-sm"
              >
                Share an update, a win or a thank-you
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {COMPOSER.map(([Icon, label, color]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setComposing(true)}
                  className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Icon className={cn('size-4', color)} /> {label}
                </button>
              ))}
              <Chip className="ml-auto">
                <Globe /> Everyone
              </Chip>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="for-you">For you</TabsTrigger>
                <TabsTrigger value="announcements">Announcements</TabsTrigger>
                <TabsTrigger value="kudos">Kudos</TabsTrigger>
                <TabsTrigger value="team" disabled title="Coming soon">
                  My team
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-[13px] text-muted-foreground">
              Sort: <b className="text-foreground">Latest</b>
            </span>
          </div>

          {posts.length === 0 ? (
            <Card className="grid justify-items-center gap-3">
              <Empty className="pb-0">Be the first to post</Empty>
              <Button onClick={() => setComposing(true)}>
                <Pencil /> New post
              </Button>
            </Card>
          ) : (
            posts.map((p) => {
              const isLiked = liked.has(p.id);
              return (
                <Card key={p.id} className="grid gap-4 sm:p-[22px]">
                  <div className="flex items-start gap-3">
                    <Avatar initials={p.author.initials} />
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{p.author.name}</span>
                        {p.tag && <Badge tone={p.tag.tone}>{p.tag.label}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.author.role} · {p.at}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="More options">
                      <MoreHorizontal />
                    </Button>
                  </div>
                  <p className="max-w-[600px] leading-[1.55]">{p.body}</p>

                  {p.attachment?.kind === 'image' && (
                    <div className="grid h-[220px] content-end rounded-2xl bg-gradient-to-br from-primary-strong via-primary to-detail p-6 text-primary-foreground">
                      <p className="text-xs font-bold tracking-[0.14em] uppercase opacity-85">
                        {p.attachment.title}
                      </p>
                      <p className="text-xl font-extrabold">{p.attachment.caption}</p>
                    </div>
                  )}
                  {p.attachment?.kind === 'event' && (
                    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2/70 p-4">
                      <div className="grid size-14 place-items-center content-center rounded-[14px] bg-primary leading-tight text-primary-foreground shadow-glow">
                        <span className="text-[11px] font-bold uppercase">
                          {p.attachment.month}
                        </span>
                        <span className="text-xl font-extrabold">{p.attachment.day}</span>
                      </div>
                      <div className="min-w-0 grow">
                        <div className="font-bold">{p.attachment.title}</div>
                        <div className="text-[13px] text-muted-foreground">{p.attachment.when}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.attachment.going + (rsvp.has(p.id) ? 1 : 0)} going ·{' '}
                          {p.attachment.maybe} maybe
                        </div>
                      </div>
                      <Button
                        variant={rsvp.has(p.id) ? 'default' : 'primary'}
                        onClick={() => {
                          setRsvp((s) => {
                            const n = new Set(s);
                            if (n.has(p.id)) n.delete(p.id);
                            else n.add(p.id);
                            return n;
                          });
                        }}
                      >
                        {rsvp.has(p.id) ? 'Going ✓' : 'RSVP'}
                      </Button>
                    </div>
                  )}
                  {p.attachment?.kind === 'kudos' && (
                    <div className="flex items-center gap-4 rounded-2xl bg-warning/10 p-4">
                      <IconTile tone="warning" size={44}>
                        <Award />
                      </IconTile>
                      <div className="grow">
                        <div className="text-xs font-bold tracking-[0.12em] text-warning uppercase">
                          Kudos · {p.attachment.value}
                        </div>
                        <div className="text-lg font-extrabold">{p.attachment.to.name}</div>
                      </div>
                      <Avatar initials={p.attachment.to.initials} />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <span className="flex -space-x-1.5">
                        {[
                          [ThumbsUp, 'bg-info text-surface'],
                          [Heart, 'bg-danger text-surface'],
                          [Star, 'bg-warning text-surface'],
                        ].map(([Icon, c], i) => {
                          const I = Icon as LucideIcon;
                          return (
                            <span
                              key={i}
                              className={cn(
                                'grid size-[22px] place-items-center rounded-full ring-2 ring-surface',
                                c as string,
                              )}
                            >
                              <I className="size-3" />
                            </span>
                          );
                        })}
                      </span>
                      {p.reactions + (isLiked ? 1 : 0)} reactions
                    </span>
                    <span>{p.comments} comments</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        [ThumbsUp, isLiked ? 'Liked' : 'Like'],
                        [MessageCircle, 'Comment'],
                        [Award, 'Kudos'],
                        [Share2, 'Share'],
                      ] as const
                    ).map(([Icon, label]) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={label.startsWith('Like') ? isLiked : undefined}
                        onClick={() =>
                          label.startsWith('Like')
                            ? setLiked((s) => {
                                const n = new Set(s);
                                if (n.has(p.id)) n.delete(p.id);
                                else n.add(p.id);
                                return n;
                              })
                            : showToast(`${label} is coming soon`)
                        }
                        className={cn(
                          'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-surface-2/60 text-[13px] font-semibold hover:bg-surface-2',
                          label === 'Liked' ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Team pulse</CardTitle>
                <CardDescription>
                  {data.pulse.survey} · {data.pulse.replies} replies
                </CardDescription>
              </div>
            </CardHeader>
            <div className="mb-5 flex justify-center">
              <ProgressRing
                value={data.pulse.score * 10}
                label="Pulse score"
                display={`${data.pulse.score}`}
                caption="of 10"
              />
            </div>
            <ul className="grid gap-3.5">
              {data.pulse.items.map((i) => (
                <li key={i.label} className="grid gap-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{i.label}</span>
                    <span className="font-mono text-[13px] text-muted-foreground">{i.pct}%</span>
                  </div>
                  <ProgressBar value={i.pct} tone={i.pct < 70 ? 'warning' : 'primary'} />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Celebrations</CardTitle>
                <CardDescription>Today and this week</CardDescription>
              </div>
            </CardHeader>
            <ul className="grid gap-3.5">
              {data.celebrations.map((c) => {
                const Icon = CELEBRATION_ICON[c.icon];
                return (
                  <li key={c.person.name} className="flex items-center gap-3">
                    <IconTile tone={c.tone} size={36}>
                      <Icon />
                    </IconTile>
                    <div className="min-w-0 grow">
                      <div className="font-semibold">{c.person.name}</div>
                      <div className="text-xs text-muted-foreground">{c.caption}</div>
                    </div>
                    <Chip
                      className="h-8 px-3 text-xs"
                      onClick={() => showToast(`Sent your wishes to ${c.person.name}`)}
                    >
                      Wish
                    </Chip>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Poll</CardTitle>
                <CardDescription>
                  {data.poll.ends} · {data.poll.votes} votes
                </CardDescription>
              </div>
            </CardHeader>
            <p className="mb-3 font-semibold">{data.poll.question}</p>
            <ul className="grid gap-2" role="radiogroup" aria-label={data.poll.question}>
              {data.poll.options.map((o) => (
                <li key={o.label}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={vote === o.label}
                    onClick={() => setVote(o.label)}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center justify-between overflow-hidden rounded-xl px-3.5 py-2.5 text-left font-semibold',
                      vote === o.label ? 'bg-primary/10 text-primary' : 'bg-surface-2/70',
                    )}
                  >
                    {o.label}
                    <span className="font-mono text-[13px]">{o.pct}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trending</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              {data.trending.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-primary/8 px-3 py-1.5 text-[13px] font-semibold text-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={composing} onOpenChange={setComposing}>
        {composing && (
          <NewPost
            author={{
              initials: toInitials(me.user.fullName),
              name: me.user.fullName,
              role: me.tenant.name,
            }}
            onPost={publish}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function NewPost({ author, onPost }: { author: Post['author']; onPost: (p: Post) => void }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'update' | 'announcement' | 'kudos'>('update');
  const [audience, setAudience] = useState('Everyone');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    onPost({
      id: `p${Date.now()}`,
      author,
      at: 'Just now',
      kind,
      tag:
        kind === 'announcement'
          ? { label: 'Announcement', tone: 'accent' }
          : kind === 'kudos'
            ? { label: 'Kudos', tone: 'warning' }
            : undefined,
      body: body.trim(),
      reactions: 0,
      comments: 0,
    });
  }

  return (
    <DialogContent title="New post" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted-foreground">What’s new?</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            required
            placeholder="Share an update, a win or a thank-you"
            className="w-full rounded-xl bg-surface-2 p-3.5 text-sm shadow-inset-sm outline-none focus-visible:outline-2 focus-visible:outline-ring/60"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="np-kind" label="Type">
            <Select
              id="np-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="update">Update</option>
              <option value="announcement">Announcement</option>
              <option value="kudos">Kudos</option>
            </Select>
          </Field>
          <Field id="np-aud" label="Audience">
            <Select id="np-aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option>Everyone</option>
              <option>My team</option>
            </Select>
          </Field>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!body.trim()}>
            Post
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
