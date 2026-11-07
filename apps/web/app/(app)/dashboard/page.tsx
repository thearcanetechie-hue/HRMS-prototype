'use client';

import {
  Award,
  CalendarDays,
  Check,
  Inbox,
  LogOut,
  Star,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';
import { ActivityItem, ApproveButtons, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import { api, ApiError, type HomeData } from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { useSession } from '@/lib/session';

const EVENT_ICON: Record<HomeData['events'][number]['kind'], [LucideIcon, Tone]> = {
  birthday: [Star, 'primary'],
  anniversary: [Award, 'detail'],
  joining: [UserPlus, 'success'],
  leaving: [LogOut, 'warning'],
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const { me, can } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState('week');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    setError('');
    api<HomeData>('/dashboard/home')
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load today’s summary.'),
      );
  }, []);
  useEffect(load, [load]);

  async function decide(item: HomeData['requests'][number], approve: boolean) {
    setBusy(item.id);
    try {
      if (item.kind === 'leave')
        await api(`/leave/requests/${item.id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision: approve ? 'APPROVE' : 'REJECT' }),
        });
      else
        await api(`/checklists/${item.checklistId}/tasks/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ done: true }),
        });
      showToast(
        item.kind === 'leave'
          ? `${approve ? 'Approved' : 'Declined'} ${item.employee.firstName}’s leave`
          : `Done: ${item.summary.split(' · ')[0]}`,
      );
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update that');
    } finally {
      setBusy(null);
    }
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const firstName = me.user.fullName.split(' ')[0];
  const hr = can('employee.manage');
  const t = data?.today;
  const presentPct = data && data.headcount ? Math.round((t!.present / data.headcount) * 100) : 0;
  const biggestTeam = Math.max(1, ...(data?.teams.map((x) => x.count) ?? [1]));
  const weekdays = data?.attendanceWeek.filter((d) => !d.weekend) ?? [];
  const lastWorkday = [...weekdays].reverse().find((d) => d.date <= (data?.date ?? ''));

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${firstName}`}
        description={
          data
            ? `${t!.present} of ${data.headcount} ${data.scope === 'team' ? 'in your team ' : ''}are in today${
                data.openRequests
                  ? `. ${data.openRequests} ${data.openRequests === 1 ? 'thing is' : 'things are'} waiting for you.`
                  : '.'
              }`
            : 'Loading today’s numbers…'
        }
        actions={
          hr ? (
            <>
              <Button asChild>
                <Link href="/attendance">
                  <CalendarDays /> Attendance & leave
                </Link>
              </Button>
              <Button variant="primary" asChild>
                <Link href="/employees?add=1">
                  <UserPlus /> Add employee
                </Link>
              </Button>
            </>
          ) : (
            <Button variant="primary" asChild>
              <Link href="/attendance">
                <CalendarDays /> Apply for leave
              </Link>
            </Button>
          )
        }
      />

      {error && (
        <Banner>
          {error}
          <Button size="sm" className="ml-auto" onClick={load}>
            Retry
          </Button>
        </Banner>
      )}

      {!data ? (
        !error && (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        )
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            <StatCard
              icon={<Users />}
              value={data.headcount}
              label={data.scope === 'team' ? 'In your team' : 'Headcount'}
              delta={data.joinedThisMonth ? `+${data.joinedThisMonth} this month` : undefined}
            />
            <StatCard
              icon={<UserCheck />}
              tone="success"
              value={t!.present}
              label="Present today"
              delta={t!.weekend ? 'Weekend' : `${presentPct}%`}
              deltaTone={t!.weekend ? 'info' : 'success'}
            />
            <StatCard
              icon={<CalendarDays />}
              tone="warning"
              value={t!.onLeave + t!.field}
              label="On leave or field visit"
              delta={t!.late ? `${t!.late} late` : undefined}
              deltaTone="warning"
            />
            <StatCard
              icon={<Inbox />}
              tone="danger"
              value={data.openRequests}
              label="Waiting on you"
              delta={data.onNotice ? `${data.onNotice} on notice` : undefined}
              deltaTone="danger"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    {range === 'week' ? 'Attendance, last 7 days' : 'Attendance by month'}
                  </CardTitle>
                  <CardDescription>Share of people present each working day</CardDescription>
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
                highlight={
                  range === 'week' ? lastWorkday?.date : data.attendanceMonths.at(-1)?.label
                }
                data={
                  range === 'week'
                    ? data.attendanceWeek.map((d) => ({
                        key: d.date,
                        label: d.label,
                        value: d.pct,
                      }))
                    : data.attendanceMonths.map((d) => ({ label: d.label, value: d.pct }))
                }
              />
              {weekdays.every((d) => d.pct === 0) && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  No attendance recorded yet. It fills in as people check in or HR marks the
                  register.
                </p>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Needs your attention</CardTitle>
                  <CardDescription>
                    {data.openRequests ? `${data.openRequests} open` : 'All clear'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/attendance#requests">View all</Link>
                </Button>
              </CardHeader>
              {data.requests.length ? (
                <ul className="grid gap-2.5">
                  {data.requests.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-[14px] bg-surface-2/70 p-3"
                    >
                      <Avatar
                        size="sm"
                        initials={initials(r.employee.firstName, r.employee.lastName)}
                      />
                      <div className="min-w-0 grow">
                        <div className="truncate font-bold">{r.employee.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.summary}</div>
                      </div>
                      {r.kind === 'leave' ? (
                        <ApproveButtons
                          subject={`${r.employee.name}: ${r.summary}`}
                          onApprove={() => decide(r, true)}
                          onDecline={() => decide(r, false)}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Mark done: ${r.summary}`}
                          disabled={busy === r.id}
                          onClick={() => decide(r, true)}
                          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-success/12 text-success hover:brightness-110"
                        >
                          <Check className="size-4" />
                        </button>
                      )}
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
                  <CardTitle>Joining and leaving</CardTitle>
                  <CardDescription>Checklists in progress</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/lifecycle">Open</Link>
                </Button>
              </CardHeader>
              {data.checklists.length ? (
                <ul className="grid gap-3.5">
                  {data.checklists.map((c) => (
                    <li key={c.id} className="grid gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/lifecycle?checklist=${c.id}`}
                          className="truncate font-semibold text-inherit no-underline"
                        >
                          {c.employee.name}
                        </Link>
                        <Badge tone={c.kind === 'ONBOARDING' ? 'success' : 'warning'}>
                          {c.kind === 'ONBOARDING' ? 'Joins' : 'Leaves'} {formatDate(c.startDate)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <ProgressBar
                          value={c.progress.total ? (c.progress.done / c.progress.total) * 100 : 0}
                        />
                        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {c.progress.done}/{c.progress.total}
                        </span>
                      </div>
                      {c.overdue > 0 && (
                        <span className="text-xs font-bold text-danger">{c.overdue} overdue</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="py-10">No one joining or leaving right now.</Empty>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Coming up</CardTitle>
                  <CardDescription>Next 14 days</CardDescription>
                </div>
              </CardHeader>
              {data.events.length ? (
                <ul className="grid gap-4">
                  {data.events.map((e) => {
                    const [Icon, tone] = EVENT_ICON[e.kind];
                    return (
                      <li key={e.title + e.date}>
                        <ActivityItem
                          icon={<Icon />}
                          tone={tone}
                          title={e.title}
                          caption={e.when}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty className="py-10">
                  No birthdays, anniversaries or joiners in the next two weeks.
                </Empty>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Headcount by team</CardTitle>
                  <CardDescription>
                    {data.headcount} {data.headcount === 1 ? 'person' : 'people'}
                  </CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3.5">
                {data.teams.map((tm) => (
                  <li key={tm.name} className="grid gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{tm.name}</span>
                      <span className="font-mono text-[13px] text-muted-foreground">
                        {tm.count}
                      </span>
                    </div>
                    <ProgressBar value={(tm.count / biggestTeam) * 100} label={tm.name} />
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
