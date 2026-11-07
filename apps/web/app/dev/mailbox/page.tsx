'use client';

import { Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface DevEmail {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  createdAt: string;
}

/** Linkify URLs in a plain-text email so verify and reset links can be clicked. */
function Body({ text }: { text: string }) {
  return (
    <pre className="font-sans text-[13px] whitespace-pre-wrap">
      {text.split(/(https?:\/\/\S+)/).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="break-all">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </pre>
  );
}

/**
 * Development only: emails the app "sent" while EMAIL_PROVIDER is "log". In production the API
 * returns nothing here and real emails go through the configured provider.
 */
export default function DevMailboxPage() {
  const [mails, setMails] = useState<DevEmail[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    api<DevEmail[]>('/dev/emails')
      .then(setMails)
      .catch(() => setMails([]));
  }, []);
  useEffect(load, [load]);
  return (
    <AuthCard
      title="Dev mailbox"
      description="Emails the app would have sent. Only on your own computer."
    >
      <Button size="sm" className="justify-self-start" onClick={load}>
        <RefreshCw /> Refresh
      </Button>
      {mails?.length ? (
        <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {mails.map((m) => (
            <li key={m.id} className="rounded-2xl bg-surface-2/60 p-3">
              <button
                type="button"
                className="grid w-full cursor-pointer gap-0.5 text-left"
                onClick={() => setOpen(open === m.id ? null : m.id)}
              >
                <span className="font-semibold">{m.subject}</span>
                <span className="text-xs text-muted-foreground">
                  To {m.to} · {new Date(m.createdAt).toLocaleString('en-IN')}
                </span>
              </button>
              {open === m.id && m.text && (
                <div className="mt-2 border-t border-border pt-2">
                  <Body text={m.text} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
          <Inbox className="size-5" /> {mails ? 'No emails yet.' : 'Loading…'}
        </p>
      )}
    </AuthCard>
  );
}
