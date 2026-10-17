'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { AlertTriangle, Bell, CheckCircle2, Play, Star, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LegendDot, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DemoBadge, Empty, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import {
  getPerformanceOverview,
  type Goal,
  type PerformanceOverview,
} from '@/lib/demo/performance';
import { cn } from '@/lib/utils';

const GOAL_STATUS: Record<Goal['status'], [string, BadgeTone, Tone]> = {
  on_track: ['On track', 'success', 'success'],
  at_risk: ['At risk', 'warning', 'warning'],
  behind: ['Behind', 'danger', 'danger'],
  done: ['Done', 'info', 'info'],
};

/** Workload bands: under 70 info, 70–94 success, 95–110 warning, over 110 danger. */
function band(pct: number) {
  if (pct > 110) return 'bg-danger/22 text-danger';
  if (pct >= 95) return 'bg-warning/14 text-warning';
  if (pct >= 70) return 'bg-success/14 text-success';
  return 'bg-info/14 text-info';
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceOverview | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getPerformanceOverview().then(setData);
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Growth" title="Workload & performance" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const { cycle } = data;
  const weeks = data.workload[0]?.weeks.map((w) => w.start) ?? [];
  const over = data.workload.filter((r) => r.weeks.some((w) => w.pct > 110)).length;
  const pctDone = cycle ? Math.round((cycle.manager / cycle.total) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Workload & performance <DemoBadge />
          </span>
        }
        description="See who is stretched, how goals are moving and where the H2 review cycle stands."
        actions={
          <>
            <Button onClick={() => showToast('Goal editor is coming soon')}>
              <Target /> New goal
            </Button>
            <Button
              variant="primary"
              disabled={Boolean(cycle)}
              title={cycle ? 'A review cycle is already running' : undefined}
            >
              <Play /> Start review cycle
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="mb-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {['Goals', 'Reviews', 'Workload', '1:1s', 'Feedback'].map((t) => (
            <TabsTrigger key={t} value={t} disabled title="Coming soon">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<Target />}
            value={`${Math.round((data.goalsOnTrack / data.goalsTotal) * 100)}%`}
            label="Goals on track"
            delta="+6%"
          />
          <StatCard
            icon={<CheckCircle2 />}
            tone="warning"
            value={cycle ? `${cycle.manager} / ${cycle.total}` : '–'}
            label="H2 reviews done"
            delta={`${pctDone}%`}
            deltaTone="warning"
          />
          <StatCard
            icon={<AlertTriangle />}
            tone="danger"
            value={`${over} people`}
            label="Over capacity"
            delta="Above 110%"
            deltaTone="danger"
          />
          <StatCard
            icon={<TrendingUp />}
            tone="success"
            value="84%"
            label="Avg utilisation"
            delta="Healthy"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="min-w-0">
            <CardHeader>
              <div>
                <CardTitle>Workload by person</CardTitle>
                <CardDescription>
                  Planned hours as a share of capacity, next 6 weeks
                </CardDescription>
              </div>
              <Chip active>Engineering</Chip>
            </CardHeader>
            <div className="overflow-x-auto pb-1">
              <table className="w-full border-separate border-spacing-1.5 text-[13px]">
                <thead>
                  <tr>
                    <th className="w-[190px] min-w-[170px] text-left text-xs font-bold text-muted-foreground uppercase">
                      Person
                    </th>
                    {weeks.map((w) => (
                      <th
                        key={w}
                        className="min-w-16 text-center text-xs font-bold text-muted-foreground"
                      >
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.workload.map((r) => (
                    <tr key={r.employee.name}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            initials={r.employee.initials}
                            className="size-[30px] text-[11px]"
                          />
                          <span className="font-semibold whitespace-nowrap">{r.employee.name}</span>
                        </div>
                      </td>
                      {r.weeks.map((w) => (
                        <td key={w.start} className="p-0">
                          <Menu.Root>
                            <Menu.Trigger
                              aria-label={`${r.employee.name}, week of ${w.start}: ${w.pct}% of capacity`}
                              className={cn(
                                'grid h-[34px] w-full cursor-pointer place-items-center rounded-[10px] text-xs font-bold tabular outline-none focus-visible:outline-2 focus-visible:outline-ring',
                                band(w.pct),
                              )}
                            >
                              {w.pct}%
                            </Menu.Trigger>
                            <Menu.Portal>
                              <Menu.Content
                                sideOffset={6}
                                className="z-50 w-64 rounded-xl bg-surface p-3.5 text-[13px] shadow-raised"
                              >
                                <div className="font-bold">
                                  {r.employee.name} · week of {w.start}
                                </div>
                                <p className="mt-1 text-muted-foreground">
                                  {w.pct}% of capacity. This week’s tasks show here once Jira is
                                  connected.
                                </p>
                                <Menu.Item asChild>
                                  <Link
                                    href="/integrations"
                                    className="mt-2 inline-block font-bold outline-none"
                                  >
                                    Connect Jira
                                  </Link>
                                </Menu.Item>
                              </Menu.Content>
                            </Menu.Portal>
                          </Menu.Root>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <LegendDot className="bg-info" label="Under 70%" />
              <LegendDot className="bg-success" label="70–94%" />
              <LegendDot className="bg-warning" label="95–110%" />
              <LegendDot className="bg-danger" label="Over 110%" />
            </div>
          </Card>

          <Card>
            {cycle ? (
              <>
                <CardHeader>
                  <div>
                    <CardTitle>{cycle.name}</CardTitle>
                    <CardDescription>Closes {cycle.closes}</CardDescription>
                  </div>
                  <Badge tone="accent">Live</Badge>
                </CardHeader>
                <div className="mb-5 flex justify-center">
                  <ProgressRing value={pctDone} label="Review cycle" caption="complete" />
                </div>
                <dl className="mb-5 grid gap-2.5">
                  {(
                    [
                      ['Self review', cycle.self],
                      ['Manager review', cycle.manager],
                      ['Calibration', cycle.calibration],
                      ['Shared', cycle.shared],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="font-semibold">{k}</dt>
                      <dd className="font-mono text-[13px] text-muted-foreground">
                        {v} / {cycle.total}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button
                  className="w-full"
                  onClick={() => showToast('Sent a reminder to 32 managers')}
                >
                  <Bell /> Nudge 32 managers
                </Button>
              </>
            ) : (
              <Empty>No review cycle running</Empty>
            )}
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card className="min-w-0">
            <CardHeader>
              <div>
                <CardTitle>Company goals</CardTitle>
                <CardDescription>
                  {data.goalsTotal} goals · {data.goalsOnTrack} on track
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" disabled title="Coming soon">
                All goals
              </Button>
            </CardHeader>
            <Table bare>
              <THead>
                <tr>
                  <TH>Goal</TH>
                  <TH>Owner</TH>
                  <TH>Due</TH>
                  <TH>Progress</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data.goals.map((g) => {
                  const [label, badge, tone] = GOAL_STATUS[g.status];
                  return (
                    <TR key={g.id}>
                      <TD className="min-w-52 font-semibold">{g.title}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Avatar initials={g.owner.initials} className="size-[30px] text-[11px]" />
                          <span className="whitespace-nowrap">{g.owner.name}</span>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">{g.due}</TD>
                      <TD>
                        <div className="flex min-w-36 items-center gap-2.5">
                          <ProgressBar value={g.progress} tone={tone} className="w-24" />
                          <span className="font-mono text-[13px]">{g.progress}%</span>
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={badge}>{label}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recognition this month</CardTitle>
                <CardDescription>From peers and managers</CardDescription>
              </div>
            </CardHeader>
            <ul className="grid gap-4">
              {data.recognition.map((r) => (
                <li key={r.employee.name} className="flex items-center gap-3">
                  <Avatar size="sm" initials={r.employee.initials} />
                  <div className="min-w-0 grow">
                    <div className="font-bold">{r.employee.name}</div>
                    <div className="text-[13px] text-muted-foreground">{r.reason}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/14 px-2.5 py-1 text-xs font-bold text-warning">
                    <Star className="size-3.5 fill-current" /> {r.stars}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <Toast message={toast} />
    </>
  );
}
