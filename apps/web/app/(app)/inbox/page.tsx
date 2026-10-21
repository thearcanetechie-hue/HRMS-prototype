'use client';

import {
  ArrowLeft,
  CheckSquare,
  Hash,
  Inbox as InboxIcon,
  Loader2,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Star,
  Video,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { SearchField, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import {
  api,
  ApiError,
  type ApprovalItem,
  type ChannelItem,
  type ChatMessage,
  type ConversationDetail,
  type ConversationItem,
  type Employee,
  type FeedPage,
  type Paged,
} from '@/lib/api';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

type Folder = 'all' | 'approvals' | 'announcements' | 'starred' | 'sent';
const FOLDERS: [Folder, string, LucideIcon][] = [
  ['all', 'All messages', InboxIcon],
  ['approvals', 'Approvals', CheckSquare],
  ['announcements', 'Announcements', Megaphone],
  ['starred', 'Starred', Star],
  ['sent', 'Sent', Send],
];
const APPROVAL: Record<ApprovalItem['kind'], [string, BadgeTone]> = {
  LEAVE: ['Leave', 'info'],
  OVERTIME: ['Overtime', 'warning'],
  EXPENSE: ['Expense', 'accent'],
  TASK: ['Checklist', 'success'],
};

const nameOf = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();
const avatarOf = (p: { firstName: string; lastName: string }) => initials(p.firstName, p.lastName);
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = (iso: string) => new Date(iso).toDateString();

/** "10:42" today, "Yesterday", a weekday this week, otherwise a date. */
function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days <= 0) return time(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function dayLabel(iso: string) {
  const w = when(iso);
  return w.includes(':') ? 'Today' : w;
}
const titleOf = (c: {
  kind: string;
  subject: string;
  with?: { firstName: string; lastName: string }[];
}) => (c.kind === 'CHANNEL' ? c.subject : c.subject);
const withOf = (c: ConversationItem) =>
  c.kind === 'CHANNEL' ? `${c.members} members` : c.with.map(nameOf).join(', ') || 'Just you';

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const params = useSearchParams();
  const router = useRouter();
  const [folder, setFolder] = useState<Folder>('all');
  const [search, setSearch] = useState('');
  const [list, setList] = useState<ConversationItem[] | null>(null);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[] | null>(null);
  const [announcements, setAnnouncements] = useState<FeedPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [composeTo, setComposeTo] = useState<string | null | undefined>(
    params.get('to') ?? undefined,
  );
  const [newChannel, setNewChannel] = useState(false);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const loadList = useCallback(async () => {
    try {
      if (folder === 'approvals') setApprovals(await api<ApprovalItem[]>('/inbox/approvals'));
      else if (folder === 'announcements')
        setAnnouncements(await api<FeedPage>('/engagement/feed?tab=announcements'));
      else
        setList(
          await api<ConversationItem[]>(
            `/inbox/conversations?folder=${folder}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`,
          ),
        );
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load your inbox.'));
    }
  }, [folder, search]);
  const loadChannels = useCallback(() => {
    api<ChannelItem[]>('/inbox/channels')
      .then(setChannels)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadList, search]);
  useEffect(loadChannels, [loadChannels]);
  useEffect(() => {
    api<ApprovalItem[]>('/inbox/approvals')
      .then(setApprovals)
      .catch(() => undefined);
  }, []);
  // Pick the newest conversation on first load.
  useEffect(() => {
    if (!selected && list?.[0] && folder === 'all') setSelected(list[0].id);
  }, [list, selected, folder]);

  const refresh = () => {
    void loadList();
    loadChannels();
  };
  const open = (id: string) => {
    setSelected(id);
    setMobileThread(true);
  };

  const unread = list?.reduce((n, c) => n + c.unread, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Inbox"
        description="Messages, channels and everything waiting on your approval."
        actions={
          <Button variant="primary" onClick={() => setComposeTo(null)}>
            <Pencil /> New message
          </Button>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5 lg:h-[calc(100vh-220px)] lg:min-h-[560px] lg:grid-cols-[210px_330px_1fr]">
        <Card
          className={cn(
            'content-start gap-1 overflow-y-auto p-3 sm:p-3',
            mobileThread ? 'hidden lg:grid' : 'grid',
          )}
        >
          {FOLDERS.map(([id, label, Icon]) => {
            const on = folder === id;
            const count =
              id === 'all'
                ? folder === 'all'
                  ? unread
                  : 0
                : id === 'approvals'
                  ? (approvals?.length ?? 0)
                  : 0;
            return (
              <button
                key={id}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => {
                  setFolder(id);
                  setMobileThread(false);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-semibold',
                  on ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                <span className="grow">{label}</span>
                {count ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold tabular',
                      on ? 'bg-primary text-primary-foreground' : 'bg-surface-2',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="mt-4 mb-1 flex items-center justify-between px-2.5">
            <span className="text-xs font-bold tracking-[0.1em] text-detail uppercase">
              Channels
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New channel"
              onClick={() => setNewChannel(true)}
            >
              <Plus />
            </Button>
          </div>
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={selected === c.id ? 'true' : undefined}
              onClick={() => {
                if (folder === 'approvals' || folder === 'announcements') setFolder('all');
                open(c.id);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left text-[13.5px]',
                selected === c.id
                  ? 'bg-primary/8 text-primary'
                  : c.unread
                    ? 'font-bold text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              <Hash className="size-3.5" />
              <span className="grow truncate">{c.name}</span>
              {!c.joined && <span className="text-[11px] text-muted-foreground">Join</span>}
              {c.unread > 0 && (
                <span
                  className="size-2 rounded-full bg-primary"
                  aria-label={`${c.unread} unread`}
                />
              )}
            </button>
          ))}
        </Card>

        <Card
          className={cn(
            'min-h-0 content-start gap-3 overflow-hidden p-3 sm:p-3',
            mobileThread ? 'hidden lg:grid' : 'grid',
          )}
        >
          {folder === 'approvals' ? (
            <ApprovalList items={approvals} />
          ) : folder === 'announcements' ? (
            <AnnouncementList page={announcements} />
          ) : (
            <>
              <SearchField
                placeholder="Search messages and people"
                aria-label="Search messages"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ul className="-mx-1 grid content-start gap-1 overflow-y-auto px-1 pb-1">
                {!list ? (
                  <Skeleton className="h-40" />
                ) : list.length === 0 ? (
                  <Empty className="py-10">
                    {search
                      ? 'Nothing matches that search'
                      : folder === 'all'
                        ? 'No messages yet'
                        : 'Nothing here'}
                  </Empty>
                ) : (
                  list.map((c) => {
                    const on = c.id === selected;
                    const first = c.with[0];
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-current={on ? 'true' : undefined}
                          onClick={() => open(c.id)}
                          className={cn(
                            'flex w-full cursor-pointer gap-3 rounded-2xl p-3 text-left transition-all',
                            on ? 'bg-surface shadow-raised' : 'hover:bg-surface-2/60',
                          )}
                        >
                          <Avatar size="sm" initials={first ? avatarOf(first) : '#'} />
                          <div className="min-w-0 grow">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'grow truncate',
                                  c.unread ? 'font-bold' : 'font-semibold',
                                )}
                              >
                                {withOf(c)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {when(c.lastMessageAt)}
                              </span>
                            </div>
                            <div className="truncate text-[13px] font-semibold">{titleOf(c)}</div>
                            <div className="flex items-center gap-2">
                              <span className="grow truncate text-xs text-muted-foreground">
                                {c.preview}
                              </span>
                              {c.starred && (
                                <Star
                                  className="size-3.5 fill-warning text-warning"
                                  aria-label="Starred"
                                />
                              )}
                              {c.unread > 0 && (
                                <span
                                  className="size-2 shrink-0 rounded-full bg-primary"
                                  aria-label="Unread"
                                />
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </Card>

        <Card
          className={cn(
            'min-h-[520px] grid-rows-[auto_1fr_auto] gap-4 lg:min-h-0',
            mobileThread ? 'grid' : 'hidden lg:grid',
          )}
        >
          {selected ? (
            <Thread
              key={selected}
              id={selected}
              onBack={() => setMobileThread(false)}
              onChanged={refresh}
              onError={showToast}
            />
          ) : (
            <Empty className="row-span-3 self-center">Pick a conversation or start a new one</Empty>
          )}
        </Card>
      </div>

      <Dialog
        open={composeTo !== undefined}
        onOpenChange={(o) => {
          if (o) return;
          setComposeTo(undefined);
          if (params.get('to')) router.replace('/inbox');
        }}
      >
        {composeTo !== undefined && (
          <NewMessage
            toId={composeTo}
            onSent={(c) => {
              setComposeTo(undefined);
              if (params.get('to')) router.replace('/inbox');
              setFolder('all');
              refresh();
              open(c.id);
            }}
          />
        )}
      </Dialog>
      <Dialog open={newChannel} onOpenChange={setNewChannel}>
        {newChannel && (
          <NewChannel
            onDone={(c) => {
              setNewChannel(false);
              showToast(`Created #${c.channelName}`);
              refresh();
              open(c.id);
            }}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function ApprovalList({ items }: { items: ApprovalItem[] | null }) {
  if (!items) return <Skeleton className="h-40" />;
  if (!items.length) return <Empty className="py-10">Nothing waiting on you</Empty>;
  return (
    <ul className="-mx-1 grid content-start gap-1 overflow-y-auto px-1 pb-1">
      {items.map((a) => (
        <li key={a.kind + a.id}>
          <Link
            href={a.href}
            className="flex gap-3 rounded-2xl p-3 no-underline hover:bg-surface-2/60"
          >
            <Avatar size="sm" initials={avatarOf(a.employee)} />
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2">
                <span className="grow truncate font-bold text-foreground">
                  {nameOf(a.employee)}
                </span>
                <Badge tone={APPROVAL[a.kind][1]}>{APPROVAL[a.kind][0]}</Badge>
              </div>
              <div className="truncate text-[13px] font-semibold text-foreground">{a.title}</div>
              <div className="truncate text-xs text-muted-foreground">{a.summary}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AnnouncementList({ page }: { page: FeedPage | null }) {
  if (!page) return <Skeleton className="h-40" />;
  if (!page.posts.length) return <Empty className="py-10">No announcements yet</Empty>;
  return (
    <ul className="-mx-1 grid content-start gap-1 overflow-y-auto px-1 pb-1">
      {page.posts.map((p) => (
        <li key={p.id}>
          <Link
            href="/engagement"
            className="flex gap-3 rounded-2xl p-3 no-underline hover:bg-surface-2/60"
          >
            <IconTile tone={p.kind === 'EVENT' ? 'info' : 'primary'} size={36}>
              <Megaphone />
            </IconTile>
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2">
                <span className="grow truncate font-bold text-foreground">
                  {p.event?.title ?? nameOf(p.author)}
                </span>
                <span className="text-xs text-muted-foreground">{when(p.createdAt)}</span>
              </div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{p.body}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Thread({
  id,
  onBack,
  onChanged,
  onError,
}: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [c, setC] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const next = await api<ConversationDetail>(`/inbox/conversations/${id}`);
        setC((prev) => {
          if (!quiet || !prev || prev.messages.length !== next.messages.length) return next;
          return prev;
        });
        if (!quiet) onChanged();
      } catch (err) {
        if (!quiet) onError(errorText(err, 'Could not open this conversation'));
      }
    },
    // onChanged/onError are stable enough for this screen; reloading on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  useEffect(() => {
    void load();
    // New messages from others show up without a refresh.
    const t = setInterval(() => void load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [c?.messages.length]);

  if (!c)
    return (
      <div className="row-span-3 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const m = await api<ChatMessage>(`/inbox/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      });
      setC((x) => x && { ...x, joined: true, messages: [...x.messages, m] });
      setDraft('');
      onChanged();
    } catch (err) {
      onError(errorText(err, 'Could not send'));
    } finally {
      setSending(false);
    }
  }

  const head = c.members[0];

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Back to messages"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        {c.kind === 'CHANNEL' ? (
          <IconTile size={40}>
            <Hash />
          </IconTile>
        ) : (
          <Avatar initials={head ? avatarOf(head) : '?'} />
        )}
        <div className="min-w-0 grow">
          <div className="truncate font-bold">{c.subject}</div>
          <div className="truncate text-xs text-muted-foreground">
            {c.kind === 'CHANNEL'
              ? [c.description, `${c.memberCount} members`].filter(Boolean).join(' · ')
              : c.members.map(nameOf).join(', ')}
          </div>
        </div>
        {c.joined && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={c.starred ? 'Unstar' : 'Star'}
            aria-pressed={c.starred}
            onClick={async () => {
              await api(`/inbox/conversations/${id}/star`, {
                method: 'POST',
                body: JSON.stringify({ starred: !c.starred }),
              });
              setC({ ...c, starred: !c.starred });
              onChanged();
            }}
          >
            <Star className={cn(c.starred && 'fill-warning text-warning')} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Start a video call"
          title="Connect Google Meet in Integrations"
          asChild
        >
          <Link href="/integrations">
            <Video />
          </Link>
        </Button>
        {c.kind === 'CHANNEL' && c.joined && c.channelName !== 'all-company' && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Leave channel"
            onClick={async () => {
              await api(`/inbox/channels/${id}/join`, {
                method: 'POST',
                body: JSON.stringify({ joined: false }),
              });
              setC({ ...c, joined: false });
              onChanged();
            }}
          >
            <LogOut />
          </Button>
        )}
      </div>

      <div className="-mx-2 grid content-start gap-4 overflow-y-auto px-2" aria-live="polite">
        {c.messages.length === 0 && (
          <Empty className="py-10">
            {c.kind === 'CHANNEL' ? 'No messages yet. Say hello.' : 'No messages yet.'}
          </Empty>
        )}
        {c.messages.map((m, i) => {
          const prev = c.messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id} className="grid gap-4">
              {newDay && (
                <span className="justify-self-center rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {dayLabel(m.createdAt)}
                </span>
              )}
              <div
                className={cn(
                  'flex max-w-[85%] gap-2.5',
                  m.mine ? 'justify-self-end' : 'justify-self-start',
                )}
              >
                {!m.mine && <Avatar initials={avatarOf(m.author)} className="size-8 text-[11px]" />}
                <div className={cn('grid gap-1.5', m.mine && 'justify-items-end')}>
                  {!m.mine && c.kind === 'CHANNEL' && (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {nameOf(m.author)}
                    </span>
                  )}
                  <div
                    className={cn(
                      'rounded-[18px] px-4 py-2.5 leading-relaxed whitespace-pre-wrap',
                      m.mine
                        ? 'rounded-br-md bg-primary text-primary-foreground'
                        : 'rounded-bl-md bg-surface-2',
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{time(m.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {c.kind === 'CHANNEL' && !c.joined ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="text-[13.5px] text-muted-foreground">
            You’re looking at {c.subject}.
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => {
              await api(`/inbox/channels/${id}/join`, {
                method: 'POST',
                body: JSON.stringify({ joined: true }),
              });
              setC({ ...c, joined: true });
              onChanged();
            }}
          >
            Join channel
          </Button>
        </div>
      ) : (
        <form
          onSubmit={send}
          className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-4 shadow-inset-sm"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={c.kind === 'CHANNEL' ? `Message ${c.subject}` : 'Write a reply…'}
            aria-label="Reply"
            className="h-10 min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || sending}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow disabled:opacity-55"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      )}
    </>
  );
}

function NewMessage({
  toId,
  onSent,
}: {
  toId: string | null;
  onSent: (c: ConversationDetail) => void;
}) {
  const [people, setPeople] = useState<{ id: string; name: string; sub: string }[]>([]);
  const [to, setTo] = useState<string[]>(toId ? [toId] : []);
  const [find, setFind] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => e.status !== 'EXITED')
            .map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`.trim(),
              sub: [e.designation?.name, e.department?.name].filter(Boolean).join(' · '),
            })),
        ),
      )
      .catch(() => undefined);
  }, []);
  const matches = find.trim()
    ? people
        .filter(
          (p) => !to.includes(p.id) && p.name.toLowerCase().includes(find.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];

  return (
    <DialogContent title="New message" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!to.length) return setError('Pick who it’s for');
          setBusy(true);
          try {
            onSent(
              await api<ConversationDetail>('/inbox/conversations', {
                method: 'POST',
                body: JSON.stringify({ toIds: to, subject: subject || undefined, body: text }),
              }),
            );
          } catch (err) {
            setError(errorText(err, 'Could not send'));
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted-foreground">To</span>
          <div className="flex flex-wrap gap-2">
            {to.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTo(to.filter((x) => x !== id))}
                className="cursor-pointer rounded-full bg-primary/10 px-3 py-1 text-[13px] font-semibold text-primary"
                aria-label={`Remove ${people.find((p) => p.id === id)?.name ?? 'person'}`}
              >
                {people.find((p) => p.id === id)?.name ?? '…'} ×
              </button>
            ))}
          </div>
          <Input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Type a name"
            aria-label="Find a person"
          />
          {matches.length > 0 && (
            <ul className="grid gap-0.5 rounded-xl bg-surface-2/60 p-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTo([...to, p.id]);
                      setFind('');
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface"
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field id="nm-subject" label="Subject (optional)">
          <Input id="nm-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-muted-foreground">Message</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            className="w-full rounded-xl bg-surface-2 p-3.5 text-sm shadow-inset-sm outline-none focus-visible:outline-2 focus-visible:outline-ring/60"
          />
        </label>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function NewChannel({ onDone }: { onDone: (c: ConversationDetail) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title="New channel" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onDone(
              await api<ConversationDetail>('/inbox/channels', {
                method: 'POST',
                body: JSON.stringify({ name, description: description || null }),
              }),
            );
          } catch (err) {
            setError(errorText(err, 'Could not create the channel'));
          }
        }}
      >
        <Field id="ch-name" label="Name">
          <Input
            id="ch-name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="bengaluru-office"
            required
          />
        </Field>
        <Field id="ch-desc" label="What it’s for (optional)">
          <Input
            id="ch-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <p className="text-[13px] text-muted-foreground">
          Channels are open to everyone in the company.
        </p>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            <Hash /> Create channel
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
