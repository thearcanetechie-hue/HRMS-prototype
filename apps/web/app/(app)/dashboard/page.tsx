'use client';

import {
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  Play,
  Star,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';
import { ActivityItem, ApproveButtons, LegendDot, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Banner, DemoBadge, Empty, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import { api, Employee, Paged } from '@/lib/api';
import { getHomeSummary, type HomeSummary } from '@/lib/demo/home';
import { useSession } from '@/lib/session';

const EVENT_ICON: Record<HomeSummary['events'][number]['kind'], [LucideIcon, Tone]> = {
  birthday: [Star, 'primary'],
  anniversary: [Award, 'detail'],
  holiday: [CalendarDays, 'warning'],
  joining: [UserPlus, 'success'],
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const { me, can } = useSession();
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState(false);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [range, setRange] = useState('week');
  const [toast, showToast] = useToast();

  const load = () => {
    setError(false);
    getHomeSummary()
      .then(setData)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  // Headcount is real: it comes from the employees API.
  useEffect(() => {
    if (!can('employee.read')) return;
    api<Paged<Employee>>('/employees?pageSize=1')
      .then((r) => setHeadcount(r.total))
      .catch(() => setHeadcount(null));
  }, [can]);

  function decide(id: string, name: string, approved: boolean) {
    setData((d) => d && { ...d, requests: d.requests.filter((r) => r.id !== id) });
    showToast(`${approved ? 'Approved' : 'Declined'} ${name}'s request`);
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const firstName = me.user.fullName.split(' ')[0];
  const total = headcount ?? data?.headcount;
  const hr = can('employee.read');
  const biggestTeam = Math.max(1, ...(data?.teams.map((t) => t.count) ?? [1]));

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {greeting()}, {firstName} <DemoBadge />
          </span>
        }
        description={
          data
            ? `${data.presentToday} of ${data.headcount} people are in today. ${data.openRequests} requests are waiting for you.`
            : 'Loading today’s numbers…'
        }
        actions={
          hr && (
            <>
              <Button asChild>
                <Link href="/employees?add=1">
                  <UserPlus /> Add employee
                </Link>
              </Button>
              <Button variant="primary" asChild>
                <Link href="/payroll">
                  <Play /> Run {data?.payroll.month ?? 'this month’s'} payroll
                </Link>
              </Button>
            </>
          )
        }
      />

      {error && (
        <Banner>
          Could not load today’s summary.
          <Button size="sm" className="ml-auto" onClick={load}>
            Retry
          </Button>
        </Banner>
      )}

      {!data ? (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            <StatCard
              icon={<Users />}
              value={total}
              label="Headcount"
              delta={`+${data.joinedThisMonth} this month`}
            />
            <StatCard
              icon={<UserCheck />}
              tone="success"
              value={data.presentToday}
              label="Present today"
              delta={`${Math.round((data.presentToday / data.headcount) * 100)}%`}
            />
            <StatCard
              icon={<CalendarDays />}
              tone="warning"
              value={data.onLeave}
              label="On leave"
              delta={`${data.sickToday} sick`}
              deltaTone="warning"
            />
            <StatCard
              icon={<Inbox />}
              tone="danger"
              value={data.openRequests}
              label="Open requests"
              delta={`${data.urgentRequests} urgent`}
              deltaTone="danger"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Attendance this {range}</CardTitle>
                  <CardDescription>Share of people checked in by 10:00</CardDescription>
                </div>
                <Tabs value={range} onValueChange={setRange}>
                  <TabsList>
                    <TabsTrigger value="week">Week</TabsTrigger>
                    <TabsTrigger value="month">Month</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <BarChart
                label="Attendance"
                max={100}
                format={(v) => `${v}%`}
                highlight={range === 'week' ? 'Fri 16' : 'Oct'}
                data={(range === 'week' ? data.attendanceWeek : data.attendanceMonth).map((d) => ({
                  label: d.label,
                  value: d.pct,
                }))}
              />
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                <LegendDot className="bg-primary" label="On time" value="88%" />
                <LegendDot className="bg-warning" label="Late" value="5%" />
                <LegendDot className="bg-detail" label="Field visit" value="3%" />
                <LegendDot className="bg-danger" label="Absent" value="4%" />
              </div>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Needs your attention</CardTitle>
                  <CardDescription>{data.openRequests} open</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/inbox">View all</Link>
                </Button>
              </CardHeader>
              {data.requests.length ? (
                <ul className="grid gap-2.5">
                  {data.requests.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-[14px] bg-surface-2/70 p-3"
                    >
                      <Avatar size="sm" initials={r.employee.initials} />
                      <div className="min-w-0 grow">
                        <div className="truncate font-bold">{r.employee.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.summary}</div>
                      </div>
                      <ApproveButtons
                        subject={`${r.employee.name}: ${r.summary}`}
                        onApprove={() => decide(r.id, r.employee.name, true)}
                        onDecline={() => decide(r.id, r.employee.name, false)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="py-10">Nothing waiting for you.</Empty>
              )}
            </Card>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{data.payroll.month} payroll</CardTitle>
                  <CardDescription>
                    Pay date {data.payroll.payDate} · {data.payroll.daysLeft} days left
                  </CardDescription>
                </div>
                <Badge tone="accent">In progress</Badge>
              </CardHeader>
              <div className="mb-5 flex justify-center">
                <ProgressRing value={data.payroll.readyPct} label="Payroll ready" caption="ready" />
              </div>
              <ul className="grid gap-2.5">
                {data.payroll.checks.map((c) => {
                  const done = c.done === c.total;
                  const Icon = done ? CheckCircle2 : Clock;
                  return (
                    <li key={c.label} className="flex items-center gap-2.5">
                      <Icon className={done ? 'size-4 text-success' : 'size-4 text-warning'} />
                      <span className="grow font-semibold">{c.label}</span>
                      <span className="font-mono text-[13px] text-muted-foreground">
                        {c.done} / {c.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Coming up</CardTitle>
                  <CardDescription>Next 14 days</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-4">
                {data.events.map((e) => {
                  const [Icon, tone] = EVENT_ICON[e.kind];
                  return (
                    <li key={e.title}>
                      <ActivityItem icon={<Icon />} tone={tone} title={e.title} caption={e.when} />
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Headcount by team</CardTitle>
                  <CardDescription>{total} people</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3.5">
                {data.teams.map((t) => (
                  <li key={t.name} className="grid gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{t.name}</span>
                      <span className="font-mono text-[13px] text-muted-foreground">{t.count}</span>
                    </div>
                    <ProgressBar value={(t.count / biggestTeam) * 100} label={t.name} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </>
  );
}
