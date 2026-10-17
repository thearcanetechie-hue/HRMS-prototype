'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Download, Pencil, Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { DemoBadge, Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TONE_FILL, TONE_TINT, type Tone } from '@/components/ui/tone';
import {
  DAY_CODES,
  getAttendanceOverview,
  leaveBadgeTone,
  type AttendanceOverview,
  type DayCode,
  type LeaveType,
} from '@/lib/demo/attendance';
import { cn } from '@/lib/utils';

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'Sa', 'Su'];
const TEAMS = ['All teams', 'Engineering', 'Sales', 'Operations'];
const LEGEND: Exclude<DayCode, 'W' | 'H'>[] = ['P', 'A', 'PL', 'SL', 'FV'];
const TONES: Tone[] = ['primary', 'detail', 'success', 'warning', 'danger', 'info'];

export default function AttendancePage() {
  const [data, setData] = useState<AttendanceOverview | null>(null);
  const [team, setTeam] = useState(TEAMS[0]);
  const [tab, setTab] = useState('register');
  const [marking, setMarking] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | 'new' | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getAttendanceOverview().then(setData);
  }, []);

  function setCell(employeeId: string, day: number, code: DayCode) {
    setData(
      (d) =>
        d && {
          ...d,
          register: d.register.map((r) =>
            r.employeeId === employeeId
              ? { ...r, days: r.days.map((c, i) => (i === day ? code : c)) }
              : r,
          ),
        },
    );
  }

  function decide(id: string, approve: boolean) {
    const r = data?.requests.find((x) => x.id === id);
    setData((d) => d && { ...d, requests: d.requests.filter((x) => x.id !== id) });
    if (r) showToast(`${approve ? 'Approved' : 'Declined'} ${r.employee.name}’s request`);
  }

  function saveType(t: LeaveType) {
    setData(
      (d) =>
        d && {
          ...d,
          leaveTypes: d.leaveTypes.some((x) => x.id === t.id)
            ? d.leaveTypes.map((x) => (x.id === t.id ? t : x))
            : [...d.leaveTypes, t],
        },
    );
    setEditingType(null);
    showToast(`Saved ${t.name}`);
  }

  function markAbsence(employeeId: string, day: number, code: DayCode) {
    setCell(employeeId, day, code);
    const name = data?.register.find((r) => r.employeeId === employeeId)?.name;
    showToast(`Saved to register: ${name}, ${day + 1} Oct, ${DAY_CODES[code as 'P']?.label}`);
    setMarking(false);
  }

  const scrollTo = (id: string) => {
    setTab(id);
    if (id !== 'register') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader
        eyebrow="Time"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Attendance & leave <DemoBadge />
          </span>
        }
        description="October 2026 register, leave requests and the leave types your company offers."
        actions={
          <>
            <Button disabled title="Coming soon">
              <Download /> Export
            </Button>
            <Button variant="primary" onClick={() => setMarking(true)} disabled={!data}>
              <Pencil /> Mark attendance
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={scrollTo}>
          <TabsList>
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="requests">Leave requests</TabsTrigger>
            <TabsTrigger value="types">Leave types</TabsTrigger>
            <TabsTrigger value="holidays" disabled title="Coming soon">
              Holidays
            </TabsTrigger>
            <TabsTrigger value="shifts" disabled title="Coming soon">
              Shifts
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          {TEAMS.map((t) => (
            <Chip key={t} active={team === t} onClick={() => setTeam(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="grid gap-5">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {data.summary.map((s) => (
              <Card key={s.label} className="flex items-center gap-3 p-4 sm:p-4">
                <span className={cn('size-2.5 rounded-full', TONE_FILL[s.tone])} />
                <span className="grow font-semibold text-muted-foreground">{s.label}</span>
                <span className="text-xl font-extrabold tabular">{s.value}</span>
              </Card>
            ))}
          </div>

          <Register data={data} onChange={setCell} />

          <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
            <Card id="requests" className="content-start">
              <CardHeader>
                <div>
                  <CardTitle>Leave requests</CardTitle>
                  <CardDescription>{data.requests.length} waiting</CardDescription>
                </div>
                <Button variant="ghost" size="sm" disabled title="Coming soon">
                  See all
                </Button>
              </CardHeader>
              {data.requests.length ? (
                <ul className="grid gap-3">
                  {data.requests.map((r) => {
                    const type = data.leaveTypes.find((t) => t.id === r.typeId);
                    return (
                      <li key={r.id} className="grid gap-3 rounded-[14px] bg-surface-2/70 p-4">
                        <div className="flex items-center gap-3">
                          <Avatar size="sm" initials={r.employee.initials} />
                          <div className="min-w-0 grow">
                            <div className="font-bold">{r.employee.name}</div>
                            <div className="text-[13px] text-muted-foreground">
                              {r.dates} · {r.days} · {r.balanceLeft}
                            </div>
                          </div>
                          {type && <Badge tone={leaveBadgeTone(type.tone)}>{type.name}</Badge>}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="h-9" onClick={() => decide(r.id, false)}>
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            className="h-9"
                            onClick={() => decide(r.id, true)}
                          >
                            Approve
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty className="py-10">No leave requests waiting</Empty>
              )}
            </Card>

            <div className="grid content-start gap-5">
              <Card id="types">
                <CardHeader>
                  <div>
                    <CardTitle>Leave types</CardTitle>
                    <CardDescription>HR can add, rename or change any type</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setEditingType('new')}>
                    <Plus /> Add type
                  </Button>
                </CardHeader>
                <ul className="grid gap-3">
                  {data.leaveTypes.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      <span className={cn('size-2.5 shrink-0 rounded-full', TONE_FILL[t.tone])} />
                      <div className="min-w-0 grow">
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.rule}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${t.name}`}
                        onClick={() => setEditingType(t)}
                      >
                        <Pencil />
                      </Button>
                      <Switch
                        aria-label={`${t.name} active`}
                        checked={t.active}
                        onCheckedChange={(active) => saveType({ ...t, active })}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Mark someone’s absence</CardTitle>
                    <CardDescription>Fill in on behalf of an employee</CardDescription>
                  </div>
                </CardHeader>
                <AbsenceForm data={data} onSave={markAbsence} idPrefix="card" />
              </Card>
            </div>
          </div>
        </div>
      )}

      <Dialog open={marking} onOpenChange={setMarking}>
        {data && (
          <DialogContent title="Mark attendance" aria-describedby={undefined}>
            <AbsenceForm data={data} onSave={markAbsence} idPrefix="dlg" />
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={editingType !== null} onOpenChange={(o) => !o && setEditingType(null)}>
        {editingType !== null && (
          <LeaveTypeDialog type={editingType === 'new' ? null : editingType} onSave={saveType} />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function Register({
  data,
  onChange,
}: {
  data: AttendanceOverview;
  onChange: (employeeId: string, day: number, code: DayCode) => void;
}) {
  const days = Array.from({ length: data.daysShown }, (_, i) => i);
  const weekday = (i: number) => (data.firstWeekday + i) % 7;
  return (
    <Card id="register">
      <CardHeader>
        <div>
          <CardTitle>{data.month} register</CardTitle>
          <CardDescription>
            Click any cell to change it. Weekends and holidays are shaded.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {LEGEND.map((c) => (
            <span
              key={c}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold',
                TONE_TINT[DAY_CODES[c].tone],
              )}
            >
              {c} {DAY_CODES[c].label.replace(' leave', '').replace(' visit', '')}
            </span>
          ))}
        </div>
      </CardHeader>
      <div className="-mx-2 overflow-x-auto px-2 pb-2">
        <table className="border-separate border-spacing-1 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[210px] min-w-[180px] bg-surface text-left text-xs font-bold text-muted-foreground uppercase">
                Employee
              </th>
              {days.map((i) => (
                <th
                  key={i}
                  className={cn(
                    'w-[38px] text-center text-[11px] leading-tight font-bold',
                    weekday(i) >= 5 ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {WEEKDAY[weekday(i)]}
                  <br />
                  <span className="text-foreground">{i + 1}</span>
                </th>
              ))}
              <th className="pl-2 text-right text-xs font-bold text-muted-foreground uppercase">
                Days
              </th>
            </tr>
          </thead>
          <tbody>
            {data.register.map((r) => {
              const working = r.days.filter((c) => c !== 'W' && c !== 'H').length;
              const present = r.days.filter((c) => ['P', 'FV', 'WFH'].includes(c)).length;
              return (
                <tr key={r.employeeId}>
                  <td className="sticky left-0 z-10 bg-surface pr-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={r.initials} className="size-[30px] text-[11px]" />
                      <span className="font-semibold whitespace-nowrap">{r.name}</span>
                    </div>
                  </td>
                  {r.days.map((c, i) =>
                    c === 'W' || c === 'H' ? (
                      <td
                        key={i}
                        aria-label="Weekend"
                        className="h-[30px] w-[38px] rounded-lg bg-surface-2 text-center text-muted-foreground"
                      >
                        ·
                      </td>
                    ) : (
                      <td key={i} className="p-0">
                        <Menu.Root>
                          <Menu.Trigger
                            aria-label={`${r.name}, ${i + 1} Oct: ${DAY_CODES[c].label}. Change`}
                            className={cn(
                              'grid h-[30px] w-[38px] cursor-pointer place-items-center rounded-lg text-[11px] font-bold outline-none focus-visible:outline-2 focus-visible:outline-ring',
                              TONE_TINT[DAY_CODES[c].tone],
                            )}
                          >
                            {c}
                          </Menu.Trigger>
                          <Menu.Portal>
                            <Menu.Content
                              sideOffset={6}
                              className="z-50 grid w-44 gap-0.5 rounded-xl bg-surface p-1.5 shadow-raised"
                            >
                              {(Object.keys(DAY_CODES) as (keyof typeof DAY_CODES)[]).map((k) => (
                                <Menu.Item
                                  key={k}
                                  onSelect={() => onChange(r.employeeId, i, k)}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-semibold outline-none data-[highlighted]:bg-surface-2"
                                >
                                  <span
                                    className={cn(
                                      'w-9 rounded-md py-0.5 text-center text-[11px]',
                                      TONE_TINT[DAY_CODES[k].tone],
                                    )}
                                  >
                                    {k}
                                  </span>
                                  {DAY_CODES[k].label}
                                </Menu.Item>
                              ))}
                            </Menu.Content>
                          </Menu.Portal>
                        </Menu.Root>
                      </td>
                    ),
                  )}
                  <td className="pl-2 text-right font-mono whitespace-nowrap">
                    {present} / {working}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AbsenceForm({
  data,
  onSave,
  idPrefix,
}: {
  data: AttendanceOverview;
  onSave: (employeeId: string, day: number, code: DayCode) => void;
  idPrefix: string;
}) {
  const [employeeId, setEmployeeId] = useState(data.register[3]?.employeeId ?? '');
  const [day, setDay] = useState('2026-10-17');
  const [code, setCode] = useState<DayCode>('A');
  const [reason, setReason] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const d = new Date(day).getDate() - 1;
    if (d < 0 || d >= data.daysShown) return;
    onSave(employeeId, d, code);
    setReason('');
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field id={`${idPrefix}-emp`} label="Employee">
        <Select
          id={`${idPrefix}-emp`}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {data.register.map((r, i) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.name} · EMP-{101 + i}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-date`} label="Date">
          <Input
            id={`${idPrefix}-date`}
            type="date"
            min="2026-10-01"
            max="2026-10-17"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <Field id={`${idPrefix}-code`} label="Mark as">
          <Select
            id={`${idPrefix}-code`}
            value={code}
            onChange={(e) => setCode(e.target.value as DayCode)}
          >
            {(Object.keys(DAY_CODES) as (keyof typeof DAY_CODES)[]).map((k) => (
              <option key={k} value={k}>
                {DAY_CODES[k].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${idPrefix}-reason`} label="Reason (shown to employee)">
        <Input
          id={`${idPrefix}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Missed biometric punch"
        />
      </Field>
      <Button variant="primary" type="submit" className="w-full">
        Save to register
      </Button>
    </form>
  );
}

function LeaveTypeDialog({
  type,
  onSave,
}: {
  type: LeaveType | null;
  onSave: (t: LeaveType) => void;
}) {
  const [name, setName] = useState(type?.name ?? '');
  const [tone, setTone] = useState<Tone>(type?.tone ?? 'info');
  const [unlimited, setUnlimited] = useState(type ? type.daysPerYear === null : false);
  const [days, setDays] = useState(String(type?.daysPerYear ?? 12));
  const [accrual, setAccrual] = useState('yearly');
  const [carry, setCarry] = useState(String(type?.carryForward ?? 0));
  const [docAfter, setDocAfter] = useState('');
  const [paid, setPaid] = useState('paid');
  const [approver, setApprover] = useState('manager');
  const [active, setActive] = useState(type?.active ?? true);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const perYear = unlimited ? null : Number(days) || 0;
    const rule = [
      perYear === null ? 'No limit' : `${perYear} days a year`,
      Number(carry) ? `carry forward ${carry}` : '',
      docAfter ? `note after ${docAfter} days` : '',
      approver === 'hr' ? 'HR approves' : unlimited ? 'manager approves' : '',
      paid === 'unpaid' ? 'unpaid' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    onSave({
      id: type?.id ?? `t${Date.now()}`,
      name: name.trim(),
      tone,
      rule,
      daysPerYear: perYear,
      carryForward: Number(carry) || 0,
      active,
    });
  }

  return (
    <DialogContent
      title={type ? `Edit ${type.name}` : 'Add leave type'}
      side="right"
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field id="lt-name" label="Name">
          <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Colour</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Colour">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                aria-label={t}
                onClick={() => setTone(t)}
                className={cn(
                  'size-8 cursor-pointer rounded-full',
                  TONE_FILL[t],
                  tone === t && 'outline-2 outline-offset-2 outline-ring',
                )}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lt-days" label="Days per year">
            <Input
              id="lt-days"
              type="number"
              min={0}
              value={unlimited ? '' : days}
              placeholder={unlimited ? 'No limit' : ''}
              disabled={unlimited}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
          <label className="flex items-end gap-2 pb-3 text-[13.5px] font-semibold">
            <Switch checked={unlimited} onCheckedChange={setUnlimited} /> No limit
          </label>
          <Field id="lt-accrual" label="Accrual">
            <Select id="lt-accrual" value={accrual} onChange={(e) => setAccrual(e.target.value)}>
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          <Field id="lt-carry" label="Carry forward days">
            <Input
              id="lt-carry"
              type="number"
              min={0}
              value={carry}
              onChange={(e) => setCarry(e.target.value)}
            />
          </Field>
          <Field id="lt-doc" label="Needs document after N days">
            <Input
              id="lt-doc"
              type="number"
              min={0}
              value={docAfter}
              placeholder="Never"
              onChange={(e) => setDocAfter(e.target.value)}
            />
          </Field>
          <Field id="lt-paid" label="Paid or unpaid">
            <Select id="lt-paid" value={paid} onChange={(e) => setPaid(e.target.value)}>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          </Field>
          <Field id="lt-approver" label="Who approves">
            <Select id="lt-approver" value={approver} onChange={(e) => setApprover(e.target.value)}>
              <option value="manager">Manager</option>
              <option value="hr">HR</option>
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-3 text-[13.5px] font-semibold">
            <Switch checked={active} onCheckedChange={setActive} /> Active
          </label>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            Save
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
