'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { CalendarPlus, ChevronLeft, ChevronRight, LogIn, LogOut, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DevicesCard, FixesCard, HolidaysCard, ShiftsCard } from '@/components/attendance-setup';
import { ApplyLeaveDialog, LeaveRequestItem, LeaveTypeDialog, MarkForm } from '@/components/leave';
import { Avatar } from '@/components/ui/avatar';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TONE_FILL, TONE_TINT, type Tone } from '@/components/ui/tone';
import {
  api,
  ApiError,
  type AttendanceRegister,
  type AttendanceToday,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
  type Named,
} from '@/lib/api';
import { initials } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const WEEKDAY = ['Su', 'M', 'T', 'W', 'T', 'F', 'Sa'];
const MARKS: Record<string, { label: string; tone: Tone }> = {
  P: { label: 'Present', tone: 'success' },
  A: { label: 'Absent', tone: 'danger' },
  HD: { label: 'Half day', tone: 'warning' },
};

const thisMonth = () => new Date().toISOString().slice(0, 7);
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function AttendancePage() {
  const { me, can } = useSession();
  const manage = can('attendance.manage');
  const [month, setMonth] = useState(thisMonth);
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Named[]>([]);
  const [register, setRegister] = useState<AttendanceRegister | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [tab, setTab] = useState('register');
  const [dialog, setDialog] = useState<'apply' | 'mark' | { type: LeaveType | null } | null>(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const loadRegister = useCallback(async () => {
    try {
      const q = new URLSearchParams({ month, ...(departmentId ? { departmentId } : {}) });
      setRegister(await api<AttendanceRegister>(`/attendance/register?${q}`));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the register.');
    }
  }, [month, departmentId]);

  const loadRest = useCallback(async () => {
    const [t, toDecide, types, bal, own] = await Promise.all([
      api<AttendanceToday>('/attendance/today'),
      api<LeaveRequest[]>('/leave/requests?status=PENDING&toDecide=true'),
      api<LeaveType[]>('/leave/types'),
      me.employee ? api<LeaveBalance[]>('/leave/balances') : Promise.resolve([]),
      me.employee
        ? api<LeaveRequest[]>(`/leave/requests?employeeId=${me.employee.id}`)
        : Promise.resolve([]),
    ]).catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Could not load attendance.');
      return [null, [], [], [], []] as const;
    });
    setToday(t);
    setRequests(toDecide as LeaveRequest[]);
    setTypes(types as LeaveType[]);
    setBalances(bal as LeaveBalance[]);
    setMine(
      (own as LeaveRequest[]).filter(
        (r) => r.status === 'PENDING' || r.endDate >= new Date().toISOString().slice(0, 10),
      ),
    );
  }, [me.employee]);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);
  // Links like /attendance?tab=fixes (from the Inbox) open on that section.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t) setTimeout(() => scrollTo(t), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void loadRest();
    api<Named[]>('/org/departments')
      .then(setDepartments)
      .catch(() => undefined);
  }, [loadRest]);

  const refresh = () => {
    void loadRegister();
    void loadRest();
  };

  async function check(kind: 'in' | 'out') {
    try {
      await api(`/attendance/check-${kind}`, { method: 'POST' });
      showToast(kind === 'in' ? 'Checked in. Have a good day!' : 'Checked out. See you tomorrow.');
      refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not record that');
    }
  }

  async function mark(employeeId: string, date: string, code: string) {
    try {
      await api('/attendance/marks', {
        method: 'PUT',
        body: JSON.stringify({ employeeId, date, code }),
      });
      void loadRegister();
      void loadRest();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not change that day');
    }
  }

  async function toggleType(t: LeaveType, active: boolean) {
    try {
      const updated = await api<LeaveType>(`/leave/types/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      setTypes((ts) => ts.map((x) => (x.id === t.id ? updated : x)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update');
    }
  }

  const scrollTo = (id: string) => {
    setTab(id);
    if (id !== 'register') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkedIn = today?.me?.checkIn;
  const checkedOut = today?.me?.checkOut;
  const summary: [string, number | undefined, Tone][] = [
    ['Present', today?.present, 'success'],
    ['Late', today?.late, 'warning'],
    ['Absent', today?.absent, 'danger'],
    ['On leave', today?.onLeave, 'info'],
    ['Field visit', today?.field, 'detail'],
  ];
  const people = (register?.rows ?? []).map((r) => ({
    id: r.employee.id,
    name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Time"
        title="Attendance & leave"
        description={`${monthLabel(month)} register, leave requests and the leave types your company offers.`}
        actions={
          <>
            {me.employee && today && !today.weekend && !today.holiday && !checkedOut && (
              <Button onClick={() => check(checkedIn ? 'out' : 'in')}>
                {checkedIn ? <LogOut /> : <LogIn />}
                {checkedIn ? `Check out (in at ${timeOf(checkedIn)})` : 'Check in'}
              </Button>
            )}
            {me.employee && checkedOut && checkedIn && (
              <span className="text-[13px] text-muted-foreground">
                Today {timeOf(checkedIn)} – {timeOf(checkedOut)}
              </span>
            )}
            <Button
              variant={manage ? 'default' : 'primary'}
              onClick={() => setDialog('apply')}
              disabled={!types.length}
            >
              <CalendarPlus /> {manage ? 'Add leave' : 'Apply for leave'}
            </Button>
            {manage && (
              <Button variant="primary" onClick={() => setDialog('mark')} disabled={!register}>
                <Pencil /> Mark attendance
              </Button>
            )}
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={scrollTo}>
          <TabsList>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="requests">Leave requests</TabsTrigger>
            <TabsTrigger value="fixes">Fixes</TabsTrigger>
            <TabsTrigger value="types">Leave types</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
            {manage && <TabsTrigger value="devices">Devices</TabsTrigger>}
          </TabsList>
        </Tabs>
        {departments.length > 0 && (manage || can('employee.read')) && (
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <Chip active={!departmentId} onClick={() => setDepartmentId('')}>
              All teams
            </Chip>
            {departments.slice(0, 5).map((d) => (
              <Chip key={d.id} active={departmentId === d.id} onClick={() => setDepartmentId(d.id)}>
                {d.name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map(([label, value, tone]) => (
            <Card key={label} className="flex items-center gap-3 p-4 sm:p-4">
              <span className={cn('size-2.5 rounded-full', TONE_FILL[tone])} />
              <span className="grow font-semibold text-muted-foreground">{label}</span>
              <span className="text-xl font-extrabold tabular">{value ?? '–'}</span>
            </Card>
          ))}
        </div>
        {today && (
          <p className="-mt-2 text-[13px] text-muted-foreground">
            {[
              today.holiday
                ? `Today is ${today.holiday}.`
                : today.weekend
                  ? 'Today is your weekly off.'
                  : today.notMarked > 0
                    ? `${today.notMarked} of ${today.headcount} not checked in yet today.`
                    : null,
              today.off > 0 && !today.weekend && !today.holiday
                ? `${today.off} on a weekly off or holiday.`
                : null,
              today.me?.shift
                ? `Your shift: ${today.me.shift.name}, ${today.me.shift.start} to ${today.me.shift.end}.`
                : null,
              today.me?.late ? 'You checked in late today.' : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}

        <Card id="register">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous month"
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                >
                  <ChevronLeft />
                </Button>
                {monthLabel(month)} register
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next month"
                  disabled={month >= thisMonth()}
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  <ChevronRight />
                </Button>
              </CardTitle>
              <CardDescription>
                {register?.canMark
                  ? 'Click any day to change it. Weekly offs and holidays are shaded.'
                  : 'Weekly offs and holidays are shaded. Missed a punch? Ask for a fix below.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ...Object.entries(MARKS).map(([code, m]) => [code, m.label, m.tone] as const),
                ['H', 'Holiday', 'primary'] as const,
                ...(register?.leaveTypes ?? [])
                  .filter((t) => t.active)
                  .map((t) => [t.code, t.name, t.tone] as const),
              ].map(([code, label, tone]) => (
                <span
                  key={code}
                  className={cn('rounded-full px-2.5 py-1 text-xs font-bold', TONE_TINT[tone])}
                >
                  {code} {label}
                </span>
              ))}
            </div>
          </CardHeader>
          {!register ? (
            <Skeleton className="h-64" />
          ) : register.rows.length === 0 ? (
            <Empty>No one to show for this month.</Empty>
          ) : (
            <Register register={register} onMark={mark} />
          )}
        </Card>

        <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
          <div className="grid content-start gap-5">
            <Card id="requests" className="content-start">
              <CardHeader>
                <div>
                  <CardTitle>Leave requests</CardTitle>
                  <CardDescription>
                    {requests ? `${requests.length} waiting for you` : 'Loading…'}
                  </CardDescription>
                </div>
              </CardHeader>
              {!requests ? (
                <Skeleton className="h-32" />
              ) : requests.length ? (
                <ul className="grid gap-3">
                  {requests.map((r) => (
                    <LeaveRequestItem
                      key={r.id}
                      request={r}
                      showPerson
                      onToast={showToast}
                      onChanged={() => refresh()}
                    />
                  ))}
                </ul>
              ) : (
                <Empty className="py-10">No leave requests waiting</Empty>
              )}
            </Card>

            {me.employee && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>My leave</CardTitle>
                    <CardDescription>
                      Balances for {new Date().getFullYear()} and upcoming leave
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setDialog('apply')}>
                    <Plus /> Apply
                  </Button>
                </CardHeader>
                <ul className="mb-5 grid gap-3.5 sm:grid-cols-2">
                  {balances
                    .filter((b) => b.entitled !== null)
                    .map((b) => (
                      <li key={b.leaveType.id} className="grid gap-1.5">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold">{b.leaveType.name}</span>
                          <span className="text-[13px] text-muted-foreground">
                            {b.left} of {b.entitled} left
                          </span>
                        </div>
                        <ProgressBar
                          value={b.entitled ? ((b.left ?? 0) / b.entitled) * 100 : 0}
                          tone={b.leaveType.tone}
                          label={b.leaveType.name}
                        />
                      </li>
                    ))}
                </ul>
                {mine.length > 0 ? (
                  <ul className="grid gap-3">
                    {mine.map((r) => (
                      <LeaveRequestItem
                        key={r.id}
                        request={r}
                        showPerson={false}
                        onToast={showToast}
                        onChanged={() => refresh()}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">No upcoming leave.</p>
                )}
              </Card>
            )}
          </div>

          <div className="grid content-start gap-5">
            <Card id="types">
              <CardHeader>
                <div>
                  <CardTitle>Leave types</CardTitle>
                  <CardDescription>
                    {manage ? 'HR can add, rename or change any type' : 'What your company offers'}
                  </CardDescription>
                </div>
                {manage && (
                  <Button size="sm" onClick={() => setDialog({ type: null })}>
                    <Plus /> Add type
                  </Button>
                )}
              </CardHeader>
              <ul className="grid gap-3">
                {types
                  .filter((t) => manage || t.active)
                  .map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <span className={cn('size-2.5 shrink-0 rounded-full', TONE_FILL[t.tone])} />
                      <div className="min-w-0 grow">
                        <div className="font-semibold">
                          {t.name}{' '}
                          <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{rule(t)}</div>
                      </div>
                      {manage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${t.name}`}
                            onClick={() => setDialog({ type: t })}
                          >
                            <Pencil />
                          </Button>
                          <Switch
                            aria-label={`${t.name} active`}
                            checked={t.active}
                            onCheckedChange={(v) => toggleType(t, v)}
                          />
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
            {manage && register && register.rows.length > 0 && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Mark someone’s attendance</CardTitle>
                    <CardDescription>Fill in on behalf of an employee</CardDescription>
                  </div>
                </CardHeader>
                <MarkForm
                  register={register}
                  idPrefix="card"
                  onSaved={(m) => {
                    showToast(m);
                    refresh();
                  }}
                />
              </Card>
            )}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <FixesCard hasEmployee={Boolean(me.employee)} onToast={showToast} onChanged={refresh} />
          <HolidaysCard manage={manage} onToast={showToast} onChanged={refresh} />
        </div>
        <div className={cn('grid gap-5', manage && 'xl:grid-cols-2')}>
          <ShiftsCard manage={manage} onToast={showToast} onChanged={refresh} />
          {manage && <DevicesCard onToast={showToast} onChanged={refresh} />}
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'apply' && (
          <ApplyLeaveDialog
            types={types}
            people={people}
            selfId={me.employee?.id ?? null}
            canApplyForOthers={manage}
            balances={balances}
            onDone={(r) => {
              setDialog(null);
              showToast(
                r.status === 'APPROVED'
                  ? 'Leave added'
                  : r.needsDocument
                    ? 'Leave requested. Please upload a supporting note in Documents.'
                    : 'Leave requested. Your manager has been asked to approve it.',
              );
              refresh();
            }}
          />
        )}
        {dialog === 'mark' && register && (
          <DialogContent title="Mark attendance" aria-describedby={undefined}>
            <MarkForm
              register={register}
              idPrefix="dlg"
              onSaved={(m) => {
                setDialog(null);
                showToast(m);
                refresh();
              }}
            />
          </DialogContent>
        )}
        {typeof dialog === 'object' && dialog !== null && (
          <LeaveTypeDialog
            type={dialog.type}
            onSaved={(t) => {
              setDialog(null);
              setTypes((ts) =>
                ts.some((x) => x.id === t.id) ? ts.map((x) => (x.id === t.id ? t : x)) : [...ts, t],
              );
              showToast(`Saved ${t.name}`);
              void loadRegister();
            }}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function rule(t: LeaveType) {
  return [
    t.daysPerYear === null
      ? 'No limit'
      : `${t.daysPerYear} days a year${t.accrual === 'MONTHLY' ? ', built up monthly' : ''}`,
    t.carryForward ? `carry forward ${t.carryForward}` : '',
    t.documentAfterDays ? `note after ${t.documentAfterDays} days` : '',
    t.approver === 'HR' ? 'HR approves' : '',
    t.countsAsPresent ? 'counts as present' : '',
    t.paid ? '' : 'unpaid',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Register({
  register,
  onMark,
}: {
  register: AttendanceRegister;
  onMark: (employeeId: string, date: string, code: string) => void;
}) {
  const toneOf = (code: string): Tone | null =>
    MARKS[code]?.tone ?? register.leaveTypes.find((t) => t.code === code)?.tone ?? null;
  const options = [
    ...Object.entries(MARKS).map(([code, m]) => ({ code, label: m.label, tone: m.tone })),
    ...register.leaveTypes
      .filter((t) => t.active)
      .map((t) => ({ code: t.code, label: t.name, tone: t.tone })),
  ];

  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-2">
      <table className="border-separate border-spacing-1 text-[13px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-[210px] min-w-[170px] bg-surface text-left text-xs font-bold text-muted-foreground uppercase">
              Employee
            </th>
            {register.days.map((d) => {
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              const holiday = register.holidays.find((h) => h.date === d && !h.optional);
              const weekend = dow === 0 || dow === 6 || Boolean(holiday);
              return (
                <th
                  key={d}
                  title={holiday?.name}
                  className={cn(
                    'w-[38px] rounded-md text-center text-[11px] leading-tight font-bold',
                    weekend ? 'text-primary' : 'text-muted-foreground',
                    d === register.today && 'bg-primary/10',
                  )}
                >
                  {WEEKDAY[dow]}
                  <br />
                  <span className="text-foreground">{Number(d.slice(8))}</span>
                </th>
              );
            })}
            <th className="pl-2 text-right text-xs font-bold text-muted-foreground uppercase">
              Days
            </th>
          </tr>
        </thead>
        <tbody>
          {register.rows.map((r) => (
            <tr key={r.employee.id}>
              <td className="sticky left-0 z-10 bg-surface pr-2">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    initials={initials(r.employee.firstName, r.employee.lastName)}
                    className="size-[30px] text-[11px]"
                  />
                  <span className="font-semibold whitespace-nowrap">
                    {r.employee.firstName} {r.employee.lastName}
                  </span>
                </div>
              </td>
              {r.cells.map((c, i) => {
                const day = register.days[i]!;
                if (c.code === 'W' || c.code === 'H')
                  return (
                    <td
                      key={day}
                      aria-label={c.code === 'H' ? `Holiday: ${c.title ?? ''}` : 'Weekly off'}
                      title={c.code === 'H' ? c.title : 'Weekly off'}
                      className={cn(
                        'h-[30px] w-[38px] rounded-lg text-center text-[11px] font-bold',
                        c.code === 'H'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-2 text-muted-foreground',
                      )}
                    >
                      {c.code === 'H' ? 'H' : '·'}
                    </td>
                  );
                const tone = toneOf(c.code);
                const future = day > register.today;
                const label = c.code
                  ? `${options.find((o) => o.code === c.code)?.label ?? c.code}${c.late ? ', late' : ''}${c.halfDay ? ', half day' : ''}`
                  : future
                    ? 'Upcoming'
                    : 'Not recorded';
                const content = (
                  <span
                    className={cn(
                      'relative grid h-[30px] w-[38px] place-items-center rounded-lg text-[11px] font-bold',
                      tone
                        ? TONE_TINT[tone]
                        : future
                          ? ''
                          : 'bg-surface-2/50 text-muted-foreground',
                    )}
                  >
                    {c.code || (future ? '' : '–')}
                    {c.late && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 size-1.5 rounded-full bg-warning"
                      />
                    )}
                  </span>
                );
                if (!register.canMark || future)
                  return (
                    <td key={day} className="p-0" title={label} aria-label={`${day}: ${label}`}>
                      {content}
                    </td>
                  );
                return (
                  <td key={day} className="p-0">
                    <Menu.Root>
                      <Menu.Trigger
                        aria-label={`${r.employee.firstName}, ${day}: ${label}. Change`}
                        className="cursor-pointer rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {content}
                      </Menu.Trigger>
                      <Menu.Portal>
                        <Menu.Content
                          sideOffset={6}
                          className="z-50 grid w-48 gap-0.5 rounded-xl bg-surface p-1.5 shadow-raised"
                        >
                          {options.map((o) => (
                            <Menu.Item
                              key={o.code}
                              onSelect={() => onMark(r.employee.id, day, o.code)}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold outline-none data-[highlighted]:bg-surface-2"
                            >
                              <span
                                className={cn(
                                  'w-10 rounded-md py-0.5 text-center text-[11px]',
                                  TONE_TINT[o.tone],
                                )}
                              >
                                {o.code}
                              </span>
                              {o.label}
                            </Menu.Item>
                          ))}
                        </Menu.Content>
                      </Menu.Portal>
                    </Menu.Root>
                  </td>
                );
              })}
              <td className="pl-2 text-right font-mono whitespace-nowrap">
                {r.present} / {r.workingDays}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
