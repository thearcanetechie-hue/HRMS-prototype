'use client';

import {
  ArrowLeft,
  CheckSquare,
  Clock,
  FileSpreadsheet,
  Hash,
  Inbox as InboxIcon,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Sparkles,
  Star,
  Video,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SearchField, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { DemoBadge, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import {
  getInboxOverview,
  type Conversation,
  type InboxOverview,
  type Message,
} from '@/lib/demo/inbox';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const FOLDER_ICON: Record<string, LucideIcon> = {
  all: InboxIcon,
  approvals: CheckSquare,
  announcements: Megaphone,
  starred: Star,
  sent: Send,
};

const toInitials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const now = () =>
  new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { me } = useSession();
  const params = useSearchParams();
  const [data, setData] = useState<InboxOverview | null>(null);
  const [folder, setFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>('c1');
  const [mobileThread, setMobileThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(Boolean(params.get('to')));
  const [toast, showToast] = useToast();
  const bottom = useRef<HTMLDivElement>(null);
  const myself = { initials: toInitials(me.user.fullName), name: me.user.fullName };

  useEffect(() => {
    getInboxOverview().then(setData);
  }, []);

  const conversation = data?.conversations.find((c) => c.id === selected);
  const thread: Message[] =
    (selected && data?.threads[selected]) ||
    (conversation
      ? [
          {
            id: `${conversation.id}-0`,
            from: conversation.with,
            mine: false,
            text: conversation.preview,
            at: conversation.at,
          },
        ]
      : []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread.length, selected]);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Communication" title="Inbox" />
        <Skeleton className="h-[600px] rounded-2xl" />
      </>
    );

  const list = data.conversations.filter(
    (c) =>
      (folder === 'all' || (folder === 'approvals' && c.tag?.label === 'Approval')) &&
      `${c.with.name} ${c.subject} ${c.preview}`.toLowerCase().includes(search.toLowerCase()),
  );

  function open(c: Conversation) {
    setSelected(c.id);
    setMobileThread(true);
    setData(
      (d) =>
        d && {
          ...d,
          conversations: d.conversations.map((x) => (x.id === c.id ? { ...x, unread: false } : x)),
        },
    );
  }

  function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    const id = `m${Date.now()}`;
    const msg: Message = {
      id,
      from: myself,
      mine: true,
      text: draft.trim(),
      at: now(),
      sending: true,
    };
    setData((d) => d && { ...d, threads: { ...d.threads, [selected]: [...thread, msg] } });
    setDraft('');
    setTimeout(
      () =>
        setData(
          (d) =>
            d && {
              ...d,
              threads: {
                ...d.threads,
                [selected]: (d.threads[selected] ?? []).map((m) =>
                  m.id === id ? { ...m, sending: false } : m,
                ),
              },
            },
        ),
      700,
    );
  }

  function startConversation(to: string, subject: string, text: string) {
    const id = `c${Date.now()}`;
    const withPerson = { initials: toInitials(to), name: to };
    setData(
      (d) =>
        d && {
          ...d,
          conversations: [
            { id, with: withPerson, subject, preview: text, at: now(), unread: false },
            ...d.conversations,
          ],
          threads: {
            ...d.threads,
            [id]: [{ id: `${id}-0`, from: myself, mine: true, text, at: now() }],
          },
        },
    );
    setSelected(id);
    setMobileThread(true);
    setComposing(false);
  }

  const unreadCount = data.conversations.filter((c) => c.unread).length;

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Inbox <DemoBadge />
          </span>
        }
        description="Messages, approvals and announcements in one place."
        actions={
          <Button variant="primary" onClick={() => setComposing(true)}>
            <Pencil /> New message
          </Button>
        }
      />

      <div className="grid gap-5 lg:h-[calc(100vh-220px)] lg:min-h-[560px] lg:grid-cols-[210px_330px_1fr]">
        <Card
          className={cn('content-start gap-1 p-3 sm:p-3', mobileThread ? 'hidden lg:grid' : 'grid')}
        >
          {data.folders.map((f) => {
            const Icon = FOLDER_ICON[f.id] ?? InboxIcon;
            const on = folder === f.id;
            const count = f.id === 'all' ? unreadCount : f.count;
            return (
              <button
                key={f.id}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => setFolder(f.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-semibold',
                  on ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                <span className="grow">{f.label}</span>
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
          <div className="mt-4 mb-1 px-2.5 text-xs font-bold tracking-[0.1em] text-detail uppercase">
            Channels
          </div>
          {data.channels.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => showToast('Channels are coming soon')}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left text-[13.5px]',
                c.unread ? 'font-bold text-foreground' : 'text-muted-foreground',
              )}
            >
              <Hash className="size-3.5" /> {c.name}
            </button>
          ))}
        </Card>

        <Card
          className={cn(
            'min-h-0 content-start gap-3 overflow-hidden p-3 sm:p-3',
            mobileThread ? 'hidden lg:grid' : 'grid',
          )}
        >
          <SearchField
            placeholder="Search messages"
            aria-label="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="-mx-1 grid content-start gap-1 overflow-y-auto px-1 pb-1">
            {list.length === 0 && <Empty className="py-10">No messages here</Empty>}
            {list.map((c) => {
              const on = c.id === selected;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => open(c)}
                    className={cn(
                      'flex w-full cursor-pointer gap-3 rounded-2xl p-3 text-left transition-all',
                      on ? 'bg-surface shadow-raised' : 'hover:bg-surface-2/60',
                    )}
                  >
                    <Avatar size="sm" initials={c.with.initials} />
                    <div className="min-w-0 grow">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn('grow truncate', c.unread ? 'font-bold' : 'font-semibold')}
                        >
                          {c.with.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.at}</span>
                      </div>
                      <div className="truncate text-[13px] font-semibold">{c.subject}</div>
                      <div className="flex items-center gap-2">
                        <span className="grow truncate text-xs text-muted-foreground">
                          {c.preview}
                        </span>
                        {c.tag && <Badge tone={c.tag.tone}>{c.tag.label}</Badge>}
                        {c.unread && (
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
            })}
          </ul>
        </Card>

        <Card
          className={cn(
            'min-h-[520px] grid-rows-[auto_1fr_auto] gap-4 lg:min-h-0',
            mobileThread ? 'grid' : 'hidden lg:grid',
          )}
        >
          {!conversation ? (
            <Empty className="row-span-3 self-center">Pick a conversation</Empty>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Back to messages"
                  onClick={() => setMobileThread(false)}
                >
                  <ArrowLeft />
                </Button>
                <Avatar initials={conversation.with.initials} />
                <div className="min-w-0 grow">
                  <div className="truncate font-bold">{conversation.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[conversation.with.name, conversation.with.team, conversation.with.where]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Star"
                  onClick={() => showToast('Starred')}
                >
                  <Star />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Start a video call" asChild>
                  <Link href="/integrations">
                    <Video />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="More options">
                  <MoreHorizontal />
                </Button>
              </div>

              <div
                className="-mx-2 grid content-start gap-4 overflow-y-auto px-2"
                aria-live="polite"
              >
                <span className="justify-self-center rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Today
                </span>
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex max-w-[85%] gap-2.5',
                      m.mine ? 'justify-self-end' : 'justify-self-start',
                    )}
                  >
                    {!m.mine && (
                      <Avatar initials={m.from.initials} className="size-8 text-[11px]" />
                    )}
                    <div className={cn('grid gap-1.5', m.mine && 'justify-items-end')}>
                      <div
                        className={cn(
                          'rounded-[18px] px-4 py-2.5 leading-relaxed',
                          m.mine
                            ? 'rounded-br-md bg-primary text-primary-foreground'
                            : 'rounded-bl-md bg-surface-2',
                        )}
                      >
                        {m.text}
                      </div>
                      {m.attachment && (
                        <div className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2 shadow-raised-sm">
                          <FileSpreadsheet className="size-4 text-success" />
                          <span className="text-[13px] font-semibold">{m.attachment.name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {m.attachment.caption}
                          </span>
                        </div>
                      )}
                      {m.request && (
                        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning/10 p-3 text-foreground">
                          <IconTile tone="warning" size={36}>
                            <Clock />
                          </IconTile>
                          <div className="grow">
                            <div className="text-[13.5px] font-bold">{m.request.title}</div>
                            <div className="text-xs text-muted-foreground">{m.request.caption}</div>
                          </div>
                          <Button size="sm" asChild>
                            <Link href={m.request.href}>Open request</Link>
                          </Button>
                        </div>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {m.sending ? 'Sending…' : m.at}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>

              <form
                onSubmit={send}
                className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-3 shadow-inset-sm"
              >
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a file">
                  <Paperclip />
                </Button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply…"
                  aria-label="Reply"
                  className="h-10 min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Suggest a reply"
                  onClick={() => setDraft('Thanks, I’ll take a look and get back to you today.')}
                >
                  <Sparkles />
                </Button>
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim()}
                  className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow disabled:opacity-55"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </Card>
      </div>

      <Dialog open={composing} onOpenChange={setComposing}>
        {composing && <NewMessage onSend={startConversation} />}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function NewMessage({ onSend }: { onSend: (to: string, subject: string, text: string) => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  return (
    <DialogContent title="New message" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (to.trim() && text.trim())
            onSend(to.trim(), subject.trim() || 'No subject', text.trim());
        }}
      >
        <Field id="nm-to" label="To">
          <Input
            id="nm-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Name or #channel"
            required
          />
        </Field>
        <Field id="nm-subject" label="Subject">
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
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            <Send /> Send
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
