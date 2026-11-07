'use client';

import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  Download,
  PackageCheck,
  Plus,
  RotateCcw,
  UserPlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AddAssetDialog,
  ASSET_STATUS,
  AssetTile,
  AssignDialog,
  dateOrDash,
  ReturnDialog,
} from '@/components/assets';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ActivityItem, SearchField, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog } from '@/components/ui/dialog';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import { ApiError } from '@/lib/api';
import {
  CONDITION_LABEL,
  getAssets,
  setAssetStatus,
  type Asset,
  type AssetStatus,
} from '@/lib/assets';
import { formatDate, inr, inrShort } from '@/lib/format';
import { cn } from '@/lib/utils';

const GROUPS: [string, string[]][] = [
  ['All', []],
  ['Computers', ['Laptop', 'Monitor']],
  ['Phones & SIMs', ['Phone', 'SIM card']],
  ['Cards', ['ID card', 'Access card']],
  ['Other', ['Headset', 'Furniture', 'Vehicle']],
];
const STATUSES: AssetStatus[] = ['ASSIGNED', 'IN_STOCK', 'IN_REPAIR', 'RETIRED', 'LOST'];
const EVENT: Record<string, [LucideIcon, Tone]> = {
  assigned: [UserPlus, 'primary'],
  returned: [RotateCcw, 'success'],
  repair: [Wrench, 'warning'],
  in_stock: [CheckCircle2, 'success'],
  added: [Plus, 'info'],
  updated: [Plus, 'info'],
  retired: [Archive, 'detail'],
  lost: [AlertTriangle, 'danger'],
};
const when = (at: string) =>
  new Date(at).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

type Flow = { kind: 'assign' | 'return'; asset: Asset } | { kind: 'add' } | null;

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [group, setGroup] = useState('All');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [toast, showToast] = useToast();

  const [error, setError] = useState('');

  useEffect(() => {
    getAssets()
      .then(setAssets)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load the register.');
        setAssets([]);
      });
  }, []);

  /** Runs a status change and reports failures instead of throwing. */
  async function change(run: () => Promise<Asset>, message: string) {
    try {
      replace(await run(), message);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update the asset');
    }
  }

  function replace(a: Asset, message: string) {
    setAssets((list) =>
      list
        ? list.some((x) => x.id === a.id)
          ? list.map((x) => (x.id === a.id ? a : x))
          : [a, ...list]
        : list,
    );
    setSelectedId(a.id);
    setFlow(null);
    showToast(message);
  }

  if (!assets)
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Assets" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const cats = GROUPS.find(([g]) => g === group)?.[1] ?? [];
  const q = search.toLowerCase();
  const rows = assets.filter(
    (a) =>
      (!cats.length || cats.includes(a.category)) &&
      (!status || a.status === status) &&
      (!q || `${a.name} ${a.tag} ${a.serial} ${a.holder?.name ?? ''}`.toLowerCase().includes(q)),
  );
  const selected = assets.find((a) => a.id === selectedId) ?? rows[0] ?? null;
  const count = (s: AssetStatus) => assets.filter((a) => a.status === s).length;
  const toCollect = assets.filter((a) => a.status === 'ASSIGNED' && a.holder?.leaving);
  const live = assets.filter((a) => a.status !== 'RETIRED' && a.status !== 'LOST');
  const value = live.reduce((n, a) => n + a.cost, 0);
  const warrantySoon = live.filter((a) => {
    if (!a.warrantyUntil) return false;
    const days = (Date.parse(a.warrantyUntil) - Date.now()) / 86_400_000;
    return days >= 0 && days <= 60;
  });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Assets"
        description="Laptops, phones, ID cards and everything else the company hands out, and who holds them."
        actions={
          <>
            <Button disabled title="Coming soon">
              <Download /> Export
            </Button>
            <Button variant="primary" onClick={() => setFlow({ kind: 'add' })}>
              <Plus /> Add asset
            </Button>
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<Boxes />}
            value={live.length}
            label="Assets in use"
            delta={inrShort(value)}
            deltaTone="info"
          />
          <StatCard
            icon={<ArrowLeftRight />}
            tone="info"
            value={count('ASSIGNED')}
            label="Assigned"
            delta={`${count('IN_STOCK')} in stock`}
          />
          <StatCard
            icon={<Wrench />}
            tone="warning"
            value={count('IN_REPAIR')}
            label="In repair"
            delta={warrantySoon.length ? `${warrantySoon.length} warranty ending` : undefined}
            deltaTone="warning"
          />
          <StatCard
            icon={<AlertTriangle />}
            tone="danger"
            value={toCollect.length}
            label="To collect from leavers"
            delta={toCollect.length ? 'Before last day' : undefined}
            deltaTone="danger"
          />
        </div>

        {toCollect.length > 0 && (
          <Card className="grid gap-3">
            <CardHeader className="mb-0">
              <div>
                <CardTitle>Collect before they leave</CardTitle>
                <CardDescription>
                  People on notice who still hold company assets. Mark each one as returned once you
                  have it back.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/lifecycle">Offboarding</Link>
              </Button>
            </CardHeader>
            <ul className="grid gap-2 md:grid-cols-2">
              {toCollect.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-[14px] bg-warning/8 p-3">
                  <AssetTile category={a.category} size={32} />
                  <div className="min-w-0 grow">
                    <div className="truncate font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.holder?.name} · last day {dateOrDash(a.holder?.leaving ?? null)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setFlow({ kind: 'return', asset: a })}>
                    <PackageCheck /> Returned
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={group} onValueChange={setGroup}>
            <TabsList>
              {GROUPS.map(([g]) => (
                <TabsTrigger key={g} value={g}>
                  {g}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <SearchField
            className="w-full sm:w-64 xl:ml-auto"
            placeholder="Name, tag, serial or person"
            aria-label="Search assets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Chip active={status === ''} onClick={() => setStatus('')}>
            All <span className="font-mono text-xs opacity-80">{assets.length}</span>
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {ASSET_STATUS[s][0]} <span className="font-mono text-xs opacity-80">{count(s)}</span>
            </Chip>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="min-w-0">
            <CardHeader>
              <div>
                <CardTitle>Register</CardTitle>
                <CardDescription>
                  {rows.length} of {assets.length} assets
                </CardDescription>
              </div>
            </CardHeader>
            {rows.length === 0 ? (
              <TableEmpty>No assets match these filters.</TableEmpty>
            ) : (
              <Table bare>
                <THead>
                  <tr>
                    <TH>Asset</TH>
                    <TH>Serial</TH>
                    <TH>Held by</TH>
                    <TH>Since</TH>
                    <TH>Condition</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((a) => (
                    <TR
                      key={a.id}
                      aria-selected={selected?.id === a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={cn(
                        'cursor-pointer',
                        selected?.id === a.id && 'bg-primary/6 even:bg-primary/6',
                      )}
                    >
                      <TD>
                        <button
                          type="button"
                          className="flex min-w-48 cursor-pointer items-center gap-2.5 text-left"
                          onClick={() => setSelectedId(a.id)}
                        >
                          <AssetTile category={a.category} size={32} />
                          <span>
                            <span className="block font-semibold">{a.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{a.tag}</span>
                          </span>
                        </button>
                      </TD>
                      <TD className="font-mono text-[13px] whitespace-nowrap text-muted-foreground">
                        {a.serial}
                      </TD>
                      <TD>
                        {a.holder ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar
                              initials={initialsOf(a.holder.name)}
                              className="size-7 text-[10px]"
                            />
                            {a.holder.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">{dateOrDash(a.since)}</TD>
                      <TD>{CONDITION_LABEL[a.condition]}</TD>
                      <TD>
                        <Badge tone={ASSET_STATUS[a.status][1]}>{ASSET_STATUS[a.status][0]}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {selected ? (
            <Card className="content-start">
              <CardHeader>
                <div className="flex min-w-0 items-center gap-3">
                  <AssetTile category={selected.category} size={44} />
                  <div className="min-w-0">
                    <CardTitle className="truncate">{selected.name}</CardTitle>
                    <CardDescription className="font-mono">{selected.tag}</CardDescription>
                  </div>
                </div>
                <Badge tone={ASSET_STATUS[selected.status][1]}>
                  {ASSET_STATUS[selected.status][0]}
                </Badge>
              </CardHeader>

              {selected.holder && (
                <div className="mb-4 flex items-center gap-3 rounded-[14px] bg-surface-2/70 p-3">
                  <Avatar size="sm" initials={initialsOf(selected.holder.name)} />
                  <div className="min-w-0 grow">
                    <div className="font-bold">
                      {selected.holder.id ? (
                        <Link
                          href={`/employees/${selected.holder.id}`}
                          className="text-inherit no-underline"
                        >
                          {selected.holder.name}
                        </Link>
                      ) : (
                        selected.holder.name
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selected.holder.code ? `${selected.holder.code} · ` : ''}since{' '}
                      {dateOrDash(selected.since)}
                      {selected.holder.leaving
                        ? ` · leaves ${formatDate(selected.holder.leaving)}`
                        : ''}
                    </div>
                  </div>
                </div>
              )}

              <dl className="mb-5 grid gap-2.5">
                {(
                  [
                    ['Type', selected.category],
                    ['Serial number', selected.serial],
                    ['Location', selected.location ?? '–'],
                    ['Bought on', dateOrDash(selected.purchasedOn)],
                    ['Cost', inr(selected.cost)],
                    [
                      'Warranty until',
                      selected.warrantyUntil ? formatDate(selected.warrantyUntil) : 'None',
                    ],
                    ['Condition', CONDITION_LABEL[selected.condition]],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd
                      className={cn(
                        'text-right font-semibold',
                        k === 'Serial number' && 'font-mono text-[13px]',
                      )}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mb-5 grid gap-2.5">
                {selected.status === 'ASSIGNED' && (
                  <Button
                    variant="primary"
                    onClick={() => setFlow({ kind: 'return', asset: selected })}
                  >
                    <PackageCheck /> Mark as returned
                  </Button>
                )}
                {selected.status === 'IN_STOCK' && (
                  <Button
                    variant="primary"
                    onClick={() => setFlow({ kind: 'assign', asset: selected })}
                  >
                    <UserPlus /> Assign to someone
                  </Button>
                )}
                {selected.status === 'IN_REPAIR' && (
                  <Button
                    variant="primary"
                    onClick={() =>
                      change(() => setAssetStatus(selected.id, 'IN_STOCK'), 'Back in stock')
                    }
                  >
                    <CheckCircle2 /> Repaired, back in stock
                  </Button>
                )}
                {(selected.status === 'IN_STOCK' || selected.status === 'ASSIGNED') && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button
                      onClick={() => {
                        if (
                          selected.status === 'ASSIGNED' &&
                          !window.confirm(
                            `Send ${selected.name} for repair? It comes back from ${selected.holder?.name}.`,
                          )
                        )
                          return;
                        void change(
                          () => setAssetStatus(selected.id, 'IN_REPAIR'),
                          'Sent for repair',
                        );
                      }}
                    >
                      <Wrench /> Repair
                    </Button>
                    {selected.status === 'IN_STOCK' ? (
                      <Button
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Retire ${selected.name}? It leaves the active register.`,
                            )
                          )
                            return;
                          void change(() => setAssetStatus(selected.id, 'RETIRED'), 'Retired');
                        }}
                      >
                        <Archive /> Retire
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (!window.confirm(`Mark ${selected.name} as lost?`)) return;
                          void change(() => setAssetStatus(selected.id, 'LOST'), 'Marked as lost');
                        }}
                      >
                        <AlertTriangle /> Lost
                      </Button>
                    )}
                  </div>
                )}
                {selected.status === 'LOST' && (
                  <Button
                    onClick={() =>
                      change(() => setAssetStatus(selected.id, 'IN_STOCK'), 'Found, back in stock')
                    }
                  >
                    <CheckCircle2 /> Found, back in stock
                  </Button>
                )}
              </div>

              <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                History
              </h4>
              <ul className="grid gap-3.5">
                {selected.history.map((e) => {
                  const [Icon, tone] = EVENT[e.kind] ?? EVENT.updated!;
                  return (
                    <li key={e.id}>
                      <ActivityItem
                        icon={<Icon />}
                        tone={tone}
                        title={e.text}
                        caption={when(e.at)}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Card>
              <Empty>Pick an asset to see its details.</Empty>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={flow !== null} onOpenChange={(o) => !o && setFlow(null)}>
        {flow?.kind === 'assign' && (
          <AssignDialog
            asset={flow.asset}
            onDone={(a) => replace(a, `Assigned to ${a.holder?.name}`)}
          />
        )}
        {flow?.kind === 'return' && (
          <ReturnDialog asset={flow.asset} onDone={(a) => replace(a, `${a.name} returned`)} />
        )}
        {flow?.kind === 'add' && (
          <AddAssetDialog onDone={(a) => replace(a, `Added ${a.name} (${a.tag})`)} />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
