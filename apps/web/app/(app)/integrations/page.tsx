'use client';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Link2,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ActivityItem, Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { DemoBadge, Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getIntegrations,
  type Integration,
  type IntegrationActivity,
  type IntegrationsOverview,
} from '@/lib/demo/integrations';
import { cn } from '@/lib/utils';

const TABS: [string, Integration['category'][]][] = [
  ['All', []],
  ['Meetings', ['Meetings', 'Calendar']],
  ['Work tracking', ['Work tracking']],
  ['Chat', ['Chat']],
  ['Finance', ['Finance']],
  ['Devices', ['Devices', 'Accounts']],
];
const ACTIVITY_ICON: Record<IntegrationActivity['icon'], LucideIcon> = {
  video: Video,
  check: Check,
  refresh: RefreshCw,
  alert: AlertTriangle,
};

function AppTile({ app, size = 48 }: { app: Integration; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-[14px] font-extrabold text-white shadow-raised-sm"
      style={{ background: app.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {app.name[0]}
    </span>
  );
}

export default function IntegrationsPage() {
  const [data, setData] = useState<IntegrationsOverview | null>(null);
  const [tab, setTab] = useState('All');
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('jira');
  const [connecting, setConnecting] = useState<Integration | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getIntegrations().then(setData);
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Connect" title="Integrations" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const cats = TABS.find(([t]) => t === tab)?.[1] ?? [];
  const apps = data.apps.filter(
    (a) => (!cats.length || cats.includes(a.category)) && (!connectedOnly || a.connected),
  );
  const selected = data.apps.find((a) => a.id === selectedId);
  const connectedCount = data.apps.filter((a) => a.connected).length;

  const update = (id: string, patch: Partial<Integration>) =>
    setData((d) => d && { ...d, apps: d.apps.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  function sync() {
    if (!selected) return;
    setSyncing(true);
    setTimeout(() => {
      update(selected.id, { lastSync: 'just now' });
      setSyncing(false);
      showToast(`${selected.name} synced`);
    }, 1200);
  }

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Integrations <DemoBadge />
          </span>
        }
        description="Connect the tools your team already uses. Data flows both ways."
        actions={
          <>
            <Button onClick={() => showToast('API keys and webhooks are coming soon')}>
              <Link2 /> API & webhooks
            </Button>
            <Button
              variant="primary"
              onClick={() => showToast('Thanks, tell us which app in Inbox')}
            >
              <Plus /> Request an app
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map(([t]) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Chip
          className="xl:ml-auto"
          active={connectedOnly}
          onClick={() => setConnectedOnly((c) => !c)}
        >
          <Check /> Connected {connectedCount}
        </Chip>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {apps.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {apps.map((a) => (
                <li key={a.id}>
                  <Card
                    className={cn(
                      'grid h-full content-start gap-3 p-5 sm:p-5',
                      a.id === selectedId && 'outline-2 outline-primary/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-label={`Show ${a.name} details`}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(a.id)}
                      >
                        <AppTile app={a} />
                      </button>
                      <Badge tone={a.connected ? 'success' : 'neutral'}>
                        {a.connected ? 'Connected' : 'Available'}
                      </Badge>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="cursor-pointer text-left font-bold"
                        onClick={() => setSelectedId(a.id)}
                      >
                        {a.name}
                      </button>
                      <div className="text-xs font-bold tracking-wide text-detail uppercase">
                        {a.category}
                      </div>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-[13px] text-muted-foreground">
                      {a.description}
                    </p>
                    {a.connected ? (
                      <Button className="w-full" onClick={() => setSelectedId(a.id)}>
                        <Settings /> Manage
                      </Button>
                    ) : (
                      <Button variant="primary" className="w-full" onClick={() => setConnecting(a)}>
                        <Plug /> Connect
                      </Button>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <Empty>No apps here yet</Empty>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-5">
          {selected && (
            <Card>
              <div className="mb-5 flex items-center gap-3">
                <AppTile app={selected} size={44} />
                <div className="min-w-0">
                  <div className="font-bold">{selected.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selected.connected
                      ? `${selected.account} · synced ${selected.lastSync}`
                      : 'Not connected'}
                  </div>
                </div>
              </div>
              {selected.connected ? (
                <>
                  {selected.settings && (
                    <>
                      <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                        What syncs
                      </h4>
                      <div className="mb-5 grid gap-4">
                        {selected.settings.map((s) => (
                          <ToggleRow
                            key={s.key}
                            title={s.label}
                            caption={s.caption}
                            checked={s.on}
                            onCheckedChange={(on) =>
                              update(selected.id, {
                                settings: selected.settings!.map((x) =>
                                  x.key === s.key ? { ...x, on } : x,
                                ),
                              })
                            }
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {selected.mappings && (
                    <>
                      <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                        Projects mapped
                      </h4>
                      <ul className="mb-5 grid gap-2">
                        {selected.mappings.map((m) => (
                          <li
                            key={m.from}
                            className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-[13px]"
                          >
                            <span className="font-mono font-semibold">{m.from}</span>
                            <ArrowRight className="size-3.5 text-muted-foreground" />
                            <span className="font-semibold">{m.to}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        update(selected.id, { connected: false });
                        showToast(`Disconnected ${selected.name}`);
                      }}
                    >
                      Disconnect
                    </Button>
                    <Button variant="primary" onClick={sync} disabled={syncing}>
                      <RefreshCw className={cn(syncing && 'animate-spin')} /> Sync now
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 text-[13px] text-muted-foreground">{selected.description}</p>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => setConnecting(selected)}
                  >
                    <Plug /> Connect {selected.name}
                  </Button>
                </>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>All integrations</CardDescription>
              </div>
            </CardHeader>
            <ul className="grid gap-4">
              {data.activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.icon];
                return (
                  <li key={a.title}>
                    <ActivityItem
                      icon={<Icon />}
                      tone={a.tone}
                      title={a.title}
                      caption={a.caption}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Dialog open={connecting !== null} onOpenChange={(o) => !o && setConnecting(null)}>
        {connecting && (
          <DialogContent title={`Connect ${connecting.name}`}>
            <DialogDescription className="mb-4 text-muted-foreground">
              {connecting.description} You’ll sign in to {connecting.name} in a new window and
              choose what HRMS can read and write.
            </DialogDescription>
            <Badge tone="info" className="mb-5">
              Coming soon
            </Badge>
            <div className="flex gap-3">
              <Button variant="primary" disabled>
                <Plug /> Continue to {connecting.name}
              </Button>
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}
