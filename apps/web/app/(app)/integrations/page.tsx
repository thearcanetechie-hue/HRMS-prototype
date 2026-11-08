'use client';

import { PERMISSIONS, type Permission, type WebhookEvent, type WebhookFormat } from '@hrms/shared';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Pause,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ActivityItem, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/input';
import { Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

interface Endpoint {
  id: string;
  name: string;
  url: string;
  format: WebhookFormat;
  events: WebhookEvent[];
  active: boolean;
  last: { status: Status; createdAt: string; responseCode: number | null } | null;
}
type Status = 'PENDING' | 'SENT' | 'FAILED';
interface Delivery {
  id: string;
  event: string;
  summary: string;
  status: Status;
  attempts: number;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
  endpoint: { name: string; format: WebhookFormat };
}
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { fullName: string };
}
interface Overview {
  events: Record<WebhookEvent, string>;
  webhooks: Endpoint[];
  apiKeys: ApiKey[];
  deliveries: Delivery[];
  devices: { total: number; online: number };
  signIn: { google: boolean; microsoft: boolean };
  email: string;
}

/** The apps on the page. `format` apps connect with a webhook address; the rest show status. */
type AppId = 'slack' | 'teams' | 'automation' | 'devices' | 'sso' | 'email';
const APPS: {
  id: AppId;
  name: string;
  category: string;
  color: string;
  description: string;
  format?: WebhookFormat;
}[] = [
  {
    id: 'slack',
    name: 'Slack',
    category: 'Chat',
    color: '#4A154B',
    format: 'SLACK',
    description: 'Post leave, joiners, kudos and announcements to a Slack channel.',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    category: 'Chat',
    color: '#5059C9',
    format: 'TEAMS',
    description: 'Post the same updates to a Teams channel as cards.',
  },
  {
    id: 'automation',
    name: 'Zapier, Make, n8n',
    category: 'Automation',
    color: '#FF4F00',
    format: 'JSON',
    description: 'Send signed events to any app that takes a webhook and build your own flows.',
  },
  {
    id: 'devices',
    name: 'Biometric devices',
    category: 'Devices',
    color: '#3D4451',
    description: 'eSSL, ZKTeco and Matrix devices send check-ins straight to attendance.',
  },
  {
    id: 'sso',
    name: 'Google and Microsoft sign-in',
    category: 'Accounts',
    color: '#1A73E8',
    description: 'Let people sign in with their work Google or Microsoft account.',
  },
  {
    id: 'email',
    name: 'Email delivery',
    category: 'Accounts',
    color: '#0F6CBD',
    description: 'Invites, password resets and sign-in codes go out by email.',
  },
];
const PLANNED = ['Google Meet', 'Zoom', 'Google Workspace accounts', 'Jira', 'Tally Prime'];

const HOW_TO: Record<WebhookFormat, string> = {
  SLACK:
    'In Slack, open Apps, add “Incoming Webhooks”, choose the channel and copy the webhook URL (it starts with https://hooks.slack.com/).',
  TEAMS:
    'In Teams, open the channel’s ••• menu, choose Workflows, pick “Post to a channel when a webhook request is received”, and copy the URL it gives you.',
  JSON: 'Paste the webhook URL from Zapier (Webhooks by Zapier → Catch Hook), Make, n8n or your own server. Each event is signed so the other side can check it came from HRMS.',
};
const FORMAT_NAME: Record<WebhookFormat, string> = {
  SLACK: 'Slack',
  TEAMS: 'Teams',
  JSON: 'Webhook',
};
const STATUS_TONE: Record<Status, BadgeTone> = {
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};
const STATUS_NAME: Record<Status, string> = {
  SENT: 'Delivered',
  PENDING: 'Retrying',
  FAILED: 'Failed',
};
const DELIVERY_ICON: Record<Status, LucideIcon> = {
  SENT: Check,
  PENDING: RefreshCw,
  FAILED: AlertTriangle,
};
const DEFAULT_EVENTS: WebhookEvent[] = [
  'employee.created',
  'leave.approved',
  'checklist.completed',
  'performance.kudos',
  'engagement.posted',
];

function AppTile({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-[14px] font-extrabold text-white shadow-raised-sm"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {name[0]}
    </span>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return formatDate(iso);
};

export default function IntegrationsPage() {
  const { me } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState('');
  const [connect, setConnect] = useState<WebhookFormat | null>(null);
  const [newKey, setNewKey] = useState(false);
  const [secret, setSecret] = useState<{ title: string; value: string; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      setData(await api<Overview>('/integrations'));
    } catch (err) {
      setFailed(err instanceof ApiError ? err.message : 'Could not load integrations.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(id);
    try {
      await fn();
      if (done) showToast(done);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong');
    }
    setBusy(null);
  }

  async function test(e: Endpoint) {
    setBusy(e.id);
    try {
      const r = await api<{ status: Status; responseCode: number | null; error: string | null }>(
        `/integrations/webhooks/${e.id}/test`,
        { method: 'POST' },
      );
      showToast(
        r.status === 'SENT'
          ? `${e.name} received the test message`
          : `${e.name} didn’t accept it: ${r.error ?? `error ${r.responseCode}`}`,
      );
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not send the test');
    }
    setBusy(null);
  }

  if (failed)
    return (
      <>
        <PageHeader eyebrow="Connect" title="Integrations" />
        <Card>
          <Empty>{failed}</Empty>
        </Card>
      </>
    );
  if (!data)
    return (
      <>
        <PageHeader eyebrow="Connect" title="Integrations" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const hooksOf = (format: WebhookFormat) => data.webhooks.filter((w) => w.format === format);
  const status = (id: AppId): { on: boolean; text: string } => {
    const app = APPS.find((a) => a.id === id)!;
    if (app.format) {
      const n = hooksOf(app.format).filter((w) => w.active).length;
      return {
        on: n > 0,
        text: n ? `${n} ${app.format === 'JSON' ? 'endpoint' : 'channel'}${n > 1 ? 's' : ''}` : '',
      };
    }
    if (id === 'devices')
      return {
        on: data.devices.total > 0,
        text: data.devices.total
          ? `${data.devices.total} device${data.devices.total > 1 ? 's' : ''} · ${data.devices.online} online`
          : '',
      };
    if (id === 'sso') {
      const on = [data.signIn.google && 'Google', data.signIn.microsoft && 'Microsoft'].filter(
        Boolean,
      );
      return { on: on.length > 0, text: on.join(' and ') };
    }
    return {
      on: data.email !== 'log',
      text: data.email === 'log' ? '' : `Sending with ${data.email}`,
    };
  };

  const action = (id: AppId) => {
    const app = APPS.find((a) => a.id === id)!;
    if (app.format)
      return (
        <Button
          variant={status(id).on ? 'default' : 'primary'}
          className="w-full"
          onClick={() => setConnect(app.format!)}
        >
          <Plug /> {status(id).on ? 'Add another' : 'Connect'}
        </Button>
      );
    if (id === 'devices')
      return (
        <Button asChild className="w-full">
          <Link href="/attendance?tab=devices">
            <Plug /> {status(id).on ? 'Manage devices' : 'Add a device'}
          </Link>
        </Button>
      );
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {status(id).on
          ? 'Set up on the server.'
          : 'Your server administrator turns this on (see the setup guide).'}
      </p>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        description="Send HRMS events to the apps your team uses, and let other apps work with HRMS through API keys."
        actions={
          <>
            <Button onClick={() => setNewKey(true)}>
              <KeyRound /> New API key
            </Button>
            <Button variant="primary" onClick={() => setConnect('JSON')}>
              <Plus /> Add webhook
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 content-start gap-5">
          <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {APPS.map((a) => {
              const s = status(a.id);
              return (
                <li key={a.id}>
                  <Card className="grid h-full content-start gap-3 p-5 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <AppTile name={a.name} color={a.color} />
                      <Badge tone={s.on ? 'success' : 'neutral'}>
                        {s.on ? 'Connected' : 'Not set up'}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-bold">{a.name}</div>
                      <div className="text-xs font-bold tracking-wide text-detail uppercase">
                        {a.category}
                        {s.text && (
                          <span className="font-semibold tracking-normal text-muted-foreground normal-case">
                            {' '}
                            · {s.text}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="min-h-10 text-[13px] text-muted-foreground">{a.description}</p>
                    {action(a.id)}
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Connected channels and webhooks</CardTitle>
                <CardDescription>Where HRMS sends events</CardDescription>
              </div>
            </CardHeader>
            {data.webhooks.length ? (
              <ul className="grid gap-2">
                {data.webhooks.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 p-3"
                  >
                    <Webhook className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        {w.name}
                        <Badge tone="info">{FORMAT_NAME[w.format]}</Badge>
                        {!w.active && <Badge>Paused</Badge>}
                        {w.last && (
                          <Badge tone={STATUS_TONE[w.last.status]}>
                            {STATUS_NAME[w.last.status]} {ago(w.last.createdAt)}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {w.url} · {w.events.length} event{w.events.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        disabled={busy === w.id}
                        onClick={() => void test(w)}
                        aria-label={`Send a test to ${w.name}`}
                      >
                        <Send /> Test
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === w.id}
                        aria-label={w.active ? `Pause ${w.name}` : `Resume ${w.name}`}
                        onClick={() =>
                          void act(
                            w.id,
                            () =>
                              api(`/integrations/webhooks/${w.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ active: !w.active }),
                              }),
                            w.active ? `Paused ${w.name}` : `Resumed ${w.name}`,
                          )
                        }
                      >
                        {w.active ? <Pause /> : <Play />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === w.id}
                        aria-label={`Remove ${w.name}`}
                        onClick={() => {
                          if (confirm(`Stop sending events to ${w.name}?`))
                            void act(
                              w.id,
                              () => api(`/integrations/webhooks/${w.id}`, { method: 'DELETE' }),
                              `Removed ${w.name}`,
                            );
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing connected yet. Connect Slack, Teams or a webhook above.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>API keys</CardTitle>
                <CardDescription>
                  For scripts and apps that read or update HRMS. A key acts as the person who made
                  it, with only the permissions picked.
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(true)}>
                <Plus /> New
              </Button>
            </CardHeader>
            {data.apiKeys.length ? (
              <ul className="grid gap-2">
                {data.apiKeys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 p-3"
                  >
                    <KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 grow">
                      <div className="font-semibold">
                        {k.name} <span className="font-mono text-xs">{k.keyPrefix}…</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {k.permissions.length} permission{k.permissions.length > 1 ? 's' : ''} ·
                        made by {k.createdBy.fullName} ·{' '}
                        {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : 'never used'}
                        {k.expiresAt && ` · expires ${formatDate(k.expiresAt)}`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === k.id}
                      onClick={() => {
                        if (confirm(`Revoke ${k.name}? Anything using it stops working.`))
                          void act(
                            k.id,
                            () => api(`/integrations/api-keys/${k.id}`, { method: 'DELETE' }),
                            `Revoked ${k.name}`,
                          );
                      }}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No API keys yet</Empty>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>What HRMS sent, newest first</CardDescription>
              </div>
            </CardHeader>
            {data.deliveries.length ? (
              <ul className="grid gap-4">
                {data.deliveries.map((d) => {
                  const Icon = DELIVERY_ICON[d.status];
                  return (
                    <li key={d.id} className="grid gap-1.5">
                      <ActivityItem
                        icon={<Icon />}
                        tone={
                          d.status === 'SENT'
                            ? 'success'
                            : d.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                        title={d.summary}
                        caption={`${d.endpoint.name} · ${STATUS_NAME[d.status]}${
                          d.error ? ` (${d.responseCode ?? d.error})` : ''
                        } · ${ago(d.createdAt)}`}
                      />
                      {d.status !== 'SENT' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="justify-self-start"
                          disabled={busy === d.id}
                          onClick={() =>
                            void act(
                              d.id,
                              () =>
                                api(`/integrations/deliveries/${d.id}/retry`, { method: 'POST' }),
                              'Sent again',
                            )
                          }
                        >
                          <RefreshCw /> Try again now
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Nothing sent yet</Empty>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Coming next</CardTitle>
                <CardDescription>Planned connections, not available yet</CardDescription>
              </div>
            </CardHeader>
            <ul className="grid gap-2">
              {PLANNED.map((p) => (
                <li key={p} className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="font-semibold">{p}</span>
                  <Badge>Planned</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ConnectDialog
        format={connect}
        events={data.events}
        onClose={() => setConnect(null)}
        onDone={(name, s) => {
          setConnect(null);
          void load();
          if (s)
            setSecret({
              title: `${name} is connected`,
              value: s,
              note: 'This is the signing secret. The other app uses it to check that events really came from HRMS (X-HRMS-Signature header, HMAC-SHA256 of “timestamp.body”). Copy it now: it won’t be shown again.',
            });
          else showToast(`${name} is connected. Send a test to check it.`);
        }}
      />
      <ApiKeyDialog
        open={newKey}
        mine={(me?.user.permissions ?? []) as Permission[]}
        onClose={() => setNewKey(false)}
        onDone={(name, key) => {
          setNewKey(false);
          void load();
          setSecret({
            title: `${name} is ready`,
            value: key,
            note: 'Send it as “Authorization: Bearer <key>”. Copy it now: it won’t be shown again. Keep it somewhere safe, like a password manager.',
          });
        }}
      />
      <Dialog open={secret !== null} onOpenChange={(o) => !o && setSecret(null)}>
        {secret && (
          <DialogContent title={secret.title}>
            <DialogDescription className="mb-4 text-muted-foreground">
              {secret.note}
            </DialogDescription>
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-surface-2 p-3">
              <code className="min-w-0 grow font-mono text-[13px] break-all">{secret.value}</code>
              <Button
                size="sm"
                aria-label="Copy"
                onClick={() =>
                  void navigator.clipboard.writeText(secret.value).then(() => showToast('Copied'))
                }
              >
                <Copy />
              </Button>
            </div>
            <DialogClose asChild>
              <Button variant="primary">I’ve copied it</Button>
            </DialogClose>
          </DialogContent>
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function ConnectDialog({
  format,
  events,
  onClose,
  onDone,
}: {
  format: WebhookFormat | null;
  events: Record<WebhookEvent, string>;
  onClose: () => void;
  onDone: (name: string, secret: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<WebhookEvent[]>(DEFAULT_EVENTS);
  const [kind, setKind] = useState<WebhookFormat>('JSON');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!format) return;
    setKind(format);
    setName(format === 'SLACK' ? 'Slack #general' : format === 'TEAMS' ? 'Teams HR channel' : '');
    setUrl('');
    setPicked(DEFAULT_EVENTS);
    setError('');
  }, [format]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ name: string; secret: string }>('/integrations/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name, url, format: kind, events: picked }),
      });
      onDone(r.name, kind === 'JSON' ? r.secret : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect');
    }
    setBusy(false);
  }

  return (
    <Dialog open={format !== null} onOpenChange={(o) => !o && onClose()}>
      {format && (
        <DialogContent
          side="right"
          title={kind === 'JSON' ? 'Add a webhook' : `Connect ${FORMAT_NAME[kind]}`}
        >
          <form onSubmit={submit} className="grid gap-4">
            <DialogDescription className="text-[13.5px] text-muted-foreground">
              {HOW_TO[kind]}
            </DialogDescription>
            {format === 'JSON' && (
              <Field id="kind" label="Send to">
                <Select
                  id="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as WebhookFormat)}
                >
                  <option value="JSON">Any app (signed JSON)</option>
                  <option value="SLACK">Slack channel</option>
                  <option value="TEAMS">Teams channel</option>
                </Select>
              </Field>
            )}
            <Field id="wh-name" label="Name">
              <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field id="wh-url" label="Webhook URL">
              <Input
                id="wh-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                required
              />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-semibold">Send these events</legend>
              {(Object.entries(events) as [WebhookEvent, string][]).map(([k, label]) => (
                <Checkbox
                  key={k}
                  label={label}
                  checked={picked.includes(k)}
                  onChange={(e) =>
                    setPicked((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))
                  }
                />
              ))}
            </fieldset>
            <FormError>{error}</FormError>
            <div className="flex gap-3">
              <Button variant="primary" type="submit" disabled={busy || !picked.length}>
                <Plug /> Connect
              </Button>
              <DialogClose asChild>
                <Button type="button">Cancel</Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ApiKeyDialog({
  open,
  mine,
  onClose,
  onDone,
}: {
  open: boolean;
  mine: Permission[];
  onClose: () => void;
  onDone: (name: string, key: string) => void;
}) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Permission[]>([]);
  const [days, setDays] = useState('90');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPicked(mine.includes('directory.read') ? ['directory.read'] : []);
    setDays('90');
    setError('');
  }, [open, mine]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ name: string; key: string }>('/integrations/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name,
          permissions: picked,
          ...(days ? { expiresInDays: Number(days) } : {}),
        }),
      });
      onDone(r.name, r.key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the key');
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent side="right" title="New API key">
          <form onSubmit={submit} className="grid gap-4">
            <DialogDescription className="text-[13.5px] text-muted-foreground">
              Pick only what the script or app needs. You can only give permissions you have
              yourself.
            </DialogDescription>
            <Field id="key-name" label="Name">
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Payroll export script"
                required
              />
            </Field>
            <Field id="key-days" label="Expires">
              <Select id="key-days" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="365">In a year</option>
                <option value="">Never</option>
              </Select>
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-semibold">Permissions</legend>
              {mine.map((p) => (
                <Checkbox
                  key={p}
                  label={
                    <span>
                      <span className="font-mono text-xs">{p}</span>
                      <span className="block text-xs text-muted-foreground">{PERMISSIONS[p]}</span>
                    </span>
                  }
                  className={cn('items-start')}
                  checked={picked.includes(p)}
                  onChange={(e) =>
                    setPicked((x) => (e.target.checked ? [...x, p] : x.filter((y) => y !== p)))
                  }
                />
              ))}
            </fieldset>
            <FormError>{error}</FormError>
            <div className="flex gap-3">
              <Button variant="primary" type="submit" disabled={busy || !picked.length}>
                <KeyRound /> Create key
              </Button>
              <DialogClose asChild>
                <Button type="button">Cancel</Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
