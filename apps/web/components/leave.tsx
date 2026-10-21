'use client';

import { Loader2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Avatar } from './ui/avatar';
import { Badge, type BadgeTone } from './ui/badge';
import { ToggleRow } from './ui/bits';
import { Button } from './ui/button';
import { DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { Switch } from './ui/switch';
import { TONE_FILL, type Tone } from './ui/tone';
import {
  api,
  ApiError,
  type AttendanceRegister,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
} from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export const TONES: Tone[] = ['primary', 'detail', 'success', 'warning', 'danger', 'info'];

export const badgeTone = (t: Tone): BadgeTone =>
  t === 'primary' ? 'accent' : t === 'detail' ? 'neutral' : t;

const STATUS: Record<LeaveRequest['status'], [string, BadgeTone]> = {
  PENDING: ['Waiting', 'warning'],
  APPROVED: ['Approved', 'success'],
  REJECTED: ['Rejected', 'danger'],
  CANCELLED: ['Cancelled', 'neutral'],
};

export function describeDates(r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'halfDay' | 'days'>) {
  const f = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const dates = r.startDate === r.endDate ? f(r.startDate) : `${f(r.startDate)} – ${f(r.endDate)}`;
  return `${dates} · ${r.halfDay ? 'half day' : `${r.days} ${r.days === 1 ? 'day' : 'days'}`}`;
}

/** One leave request as a tinted well, with decide or withdraw buttons when allowed. */
export function LeaveRequestItem({
  request: r,
  showPerson,
  onChanged,
  onToast,
}: {
  request: LeaveRequest;
  showPerson: boolean;
  onChanged: (r: LeaveRequest) => void;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const name = `${r.employee.firstName} ${r.employee.lastName}`.trim();

  async function act(path: string, body?: object, done?: string) {
    setBusy(true);
    try {
      const updated = await api<LeaveRequest>(`/leave/requests/${r.id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      onChanged(updated);
      if (done) onToast(done);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not update the request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 rounded-[14px] bg-surface-2/70 p-4">
      <div className="flex items-center gap-3">
        {showPerson && (
          <Avatar size="sm" initials={initials(r.employee.firstName, r.employee.lastName)} />
        )}
        <div className="min-w-0 grow">
          <div className="font-bold">{showPerson ? name : r.leaveType.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {describeDates(r)}
            {r.reason ? ` · ${r.reason}` : ''}
          </div>
        </div>
        {showPerson ? (
          <Badge tone={badgeTone(r.leaveType.tone)}>{r.leaveType.name}</Badge>
        ) : (
          <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
        )}
      </div>
      {(r.canDecide || r.canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {r.canCancel && !r.canDecide && (
            <Button
              size="sm"
              className="h-9"
              disabled={busy}
              onClick={() => act('cancel', undefined, 'Leave cancelled')}
            >
              {r.status === 'APPROVED' ? 'Cancel leave' : 'Withdraw'}
            </Button>
          )}
          {r.canDecide && (
            <>
              <Button
                size="sm"
                className="h-9"
                disabled={busy}
                onClick={() => act('decision', { decision: 'REJECT' }, `Declined ${name}’s leave`)}
              >
                Decline
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="h-9"
                disabled={busy}
                onClick={() => act('decision', { decision: 'APPROVE' }, `Approved ${name}’s leave`)}
              >
                {busy && <Loader2 className="animate-spin" />}
                Approve
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Apply for leave: for yourself, or (HR) for someone else, which is approved straight away. */
export function ApplyLeaveDialog({
  types,
  people,
  selfId,
  canApplyForOthers,
  balances,
  onDone,
}: {
  types: LeaveType[];
  people: { id: string; name: string }[];
  selfId: string | null;
  canApplyForOthers: boolean;
  balances: LeaveBalance[];
  onDone: (r: LeaveRequest) => void;
}) {
  const active = types.filter((t) => t.active);
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState(selfId ?? people[0]?.id ?? '');
  const [leaveTypeId, setLeaveTypeId] = useState(active[0]?.id ?? '');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const type = active.find((t) => t.id === leaveTypeId);
  const balance =
    employeeId === selfId ? balances.find((b) => b.leaveType.id === leaveTypeId) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(
        await api<LeaveRequest>('/leave/requests', {
          method: 'POST',
          body: JSON.stringify({
            ...(employeeId && employeeId !== selfId ? { employeeId } : {}),
            leaveTypeId,
            startDate,
            endDate: halfDay ? startDate : endDate,
            halfDay,
            reason: reason || null,
          }),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not apply for leave');
      setBusy(false);
    }
  }

  return (
    <DialogContent title="Apply for leave" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        {canApplyForOthers && (
          <Field id="al-who" label="For">
            <Select id="al-who" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {selfId && <option value={selfId}>Myself</option>}
              {people
                .filter((p) => p.id !== selfId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field id="al-type" label="Type of leave">
          <Select id="al-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            {active.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        {balance && balance.left !== null && (
          <p className="-mt-2 text-[13px] text-muted-foreground">
            {balance.left} of {balance.entitled} days left
            {balance.pending ? ` · ${balance.pending} waiting for approval` : ''}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="al-from" label="From">
            <Input
              id="al-from"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
              }}
              required
            />
          </Field>
          <Field id="al-to" label="To">
            <Input
              id="al-to"
              type="date"
              value={halfDay ? startDate : endDate}
              min={startDate}
              disabled={halfDay}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>
        <ToggleRow title="Half day" checked={halfDay} onCheckedChange={setHalfDay} />
        <Field id="al-reason" label="Reason (optional)">
          <Input id="al-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {type?.documentAfterDays && (
          <p className="text-[13px] text-muted-foreground">
            For more than {type.documentAfterDays} days, please upload a note in Documents.
          </p>
        )}
        {employeeId !== selfId && (
          <p className="text-[13px] text-muted-foreground">
            Leave you add for someone else is approved straight away.
          </p>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!leaveTypeId || !employeeId || busy}>
            {busy && <Loader2 className="animate-spin" />}
            {employeeId !== selfId ? 'Add leave' : 'Apply'}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

/** HR's mark for someone on a day: present, absent, half day, or a leave type. */
export function MarkForm({
  register,
  idPrefix,
  onSaved,
}: {
  register: AttendanceRegister;
  idPrefix: string;
  onSaved: (message: string) => void;
}) {
  const lastWorkday = [...register.days]
    .filter((d) => d <= register.today)
    .reverse()
    .find((d) => {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      return dow !== 0 && dow !== 6;
    });
  const [employeeId, setEmployeeId] = useState(register.rows[0]?.employee.id ?? '');
  const [date, setDate] = useState(lastWorkday ?? register.today);
  const [code, setCode] = useState('A');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employeeId && register.rows[0]) setEmployeeId(register.rows[0].employee.id);
  }, [register, employeeId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/attendance/marks', {
        method: 'PUT',
        body: JSON.stringify({ employeeId, date, code, note: note || null }),
      });
      const row = register.rows.find((r) => r.employee.id === employeeId);
      setNote('');
      onSaved(`Saved to register: ${row?.employee.firstName ?? ''}, ${formatDate(date)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field id={`${idPrefix}-emp`} label="Employee">
        <Select
          id={`${idPrefix}-emp`}
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {register.rows.map((r) => (
            <option key={r.employee.id} value={r.employee.id}>
              {r.employee.firstName} {r.employee.lastName} · {r.employee.employeeCode}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-date`} label="Date">
          <Input
            id={`${idPrefix}-date`}
            type="date"
            max={register.today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field id={`${idPrefix}-code`} label="Mark as">
          <Select id={`${idPrefix}-code`} value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="P">Present</option>
            <option value="A">Absent</option>
            <option value="HD">Half day</option>
            {register.leaveTypes
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <Field id={`${idPrefix}-note`} label="Reason (shown to employee)">
        <Input
          id={`${idPrefix}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Missed biometric punch"
        />
      </Field>
      <FormError>{error}</FormError>
      <Button variant="primary" type="submit" className="w-full" disabled={!employeeId || busy}>
        {busy && <Loader2 className="animate-spin" />}
        Save to register
      </Button>
    </form>
  );
}

/** Add or edit a leave type. */
export function LeaveTypeDialog({
  type,
  onSaved,
}: {
  type: LeaveType | null;
  onSaved: (t: LeaveType) => void;
}) {
  const [name, setName] = useState(type?.name ?? '');
  const [code, setCode] = useState(type?.code ?? '');
  const [tone, setTone] = useState<Tone>(type?.tone ?? 'info');
  const [unlimited, setUnlimited] = useState(type ? type.daysPerYear === null : false);
  const [days, setDays] = useState(String(type?.daysPerYear ?? 12));
  const [accrual, setAccrual] = useState(type?.accrual ?? 'YEARLY');
  const [carry, setCarry] = useState(String(type?.carryForward ?? 0));
  const [docAfter, setDocAfter] = useState(
    type?.documentAfterDays ? String(type.documentAfterDays) : '',
  );
  const [paid, setPaid] = useState(type?.paid ?? true);
  const [approver, setApprover] = useState(type?.approver ?? 'MANAGER');
  const [countsAsPresent, setCountsAsPresent] = useState(type?.countsAsPresent ?? false);
  const [active, setActive] = useState(type?.active ?? true);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const body = {
      name,
      code,
      tone,
      daysPerYear: unlimited ? null : Number(days) || 0,
      accrual,
      carryForward: Number(carry) || 0,
      documentAfterDays: docAfter ? Number(docAfter) : null,
      paid,
      approver,
      countsAsPresent,
      active,
    };
    try {
      onSaved(
        await api<LeaveType>(type ? `/leave/types/${type.id}` : '/leave/types', {
          method: type ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Another leave type already uses that name or code.'
          : err instanceof ApiError
            ? err.message
            : 'Could not save',
      );
    }
  }

  return (
    <DialogContent
      title={type ? `Edit ${type.name}` : 'Add leave type'}
      side="right"
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field id="lt-name" label="Name">
            <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field id="lt-code" label="Code">
            <Input
              id="lt-code"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono"
              placeholder="PL"
              required
            />
          </Field>
        </div>
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
          <Field id="lt-accrual" label="Builds up">
            <Select
              id="lt-accrual"
              value={accrual}
              onChange={(e) => setAccrual(e.target.value as typeof accrual)}
            >
              <option value="YEARLY">All at once each year</option>
              <option value="MONTHLY">A little each month</option>
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
          <Field id="lt-doc" label="Needs a document after">
            <Input
              id="lt-doc"
              type="number"
              min={1}
              value={docAfter}
              placeholder="Never"
              onChange={(e) => setDocAfter(e.target.value)}
            />
          </Field>
          <Field id="lt-approver" label="Who approves">
            <Select
              id="lt-approver"
              value={approver}
              onChange={(e) => setApprover(e.target.value as typeof approver)}
            >
              <option value="MANAGER">Their manager (or HR)</option>
              <option value="HR">HR only</option>
            </Select>
          </Field>
        </div>
        <ToggleRow title="Paid" checked={paid} onCheckedChange={setPaid} />
        <ToggleRow
          title="Counts as present"
          caption="For field visits or work from home"
          checked={countsAsPresent}
          onCheckedChange={setCountsAsPresent}
        />
        <ToggleRow
          title="Active"
          caption="People can apply for it"
          checked={active}
          onCheckedChange={setActive}
        />
        <FormError>{error}</FormError>
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
