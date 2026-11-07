'use client';

import {
  CalendarPlus,
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Avatar } from './ui/avatar';
import { Badge, type BadgeTone } from './ui/badge';
import { ToggleRow } from './ui/bits';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Chip } from './ui/chip';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { Empty, IconTile } from './ui/page';
import { Skeleton } from './ui/progress';
import { Switch } from './ui/switch';
import {
  api,
  ApiError,
  type DeviceItem,
  type Employee,
  type FixRequest,
  type HolidayItem,
  type Named,
  type Paged,
  type ShiftItem,
  type UnmatchedUser,
} from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const hours = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
const FIX_TONE: Record<FixRequest['status'], BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

function usePeople() {
  const [people, setPeople] = useState<{ id: string; name: string; dept: string | null }[]>([]);
  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => e.status !== 'EXITED')
            .map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`.trim(),
              dept: e.department?.name ?? null,
            })),
        ),
      )
      .catch(() => undefined);
  }, []);
  return people;
}

function Actions({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Button variant="primary" type="submit" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      <DialogClose asChild>
        <Button type="button">Cancel</Button>
      </DialogClose>
    </div>
  );
}

// ---------------------------------------------------------------- missed-punch fixes

export function FixesCard({
  hasEmployee,
  onToast,
  onChanged,
}: {
  hasEmployee: boolean;
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [toDecide, setToDecide] = useState<FixRequest[] | null>(null);
  const [mine, setMine] = useState<FixRequest[]>([]);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    const [all, own] = await Promise.all([
      api<FixRequest[]>('/attendance/regularisations?status=PENDING'),
      hasEmployee
        ? api<FixRequest[]>('/attendance/regularisations?mine=true')
        : Promise.resolve([]),
    ]).catch(() => [[], []] as FixRequest[][]);
    setToDecide(all!.filter((r) => r.canDecide));
    setMine(own!.slice(0, 6));
  }, [hasEmployee]);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(r: FixRequest, decision: 'APPROVE' | 'REJECT') {
    try {
      await api(`/attendance/regularisations/${r.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      onToast(
        decision === 'APPROVE'
          ? `Fixed ${r.employee.firstName}’s ${formatDate(r.date)}`
          : 'Request declined',
      );
      void load();
      onChanged();
    } catch (err) {
      onToast(errorText(err, 'Could not decide'));
    }
  }

  const times = (r: { checkIn: string | null; checkOut: string | null }) =>
    [r.checkIn ? `in ${r.checkIn}` : null, r.checkOut ? `out ${r.checkOut}` : null]
      .filter(Boolean)
      .join(' · ') || 'nothing';

  return (
    <Card id="fixes" className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Attendance fixes</CardTitle>
          <CardDescription>
            Missed punches and wrong times, decided by the manager or HR
          </CardDescription>
        </div>
        {hasEmployee && (
          <Button size="sm" onClick={() => setAsking(true)}>
            <Plus /> Fix a day
          </Button>
        )}
      </CardHeader>
      {!toDecide ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          {toDecide.length > 0 && (
            <ul className="mb-4 grid gap-2.5">
              {toDecide.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/60 p-3.5"
                >
                  <Avatar
                    size="sm"
                    initials={initials(r.employee.firstName, r.employee.lastName)}
                  />
                  <div className="min-w-0 grow basis-52">
                    <div className="font-bold">
                      {r.employee.firstName} {r.employee.lastName} · {formatDate(r.date)}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      Wants {times(r)} · recorded {times(r.recorded)}
                    </div>
                    <div className="text-[13px]">“{r.reason}”</div>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => decide(r, 'APPROVE')}>
                    <Check /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(r, 'REJECT')}>
                    <X /> Decline
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {mine.length > 0 ? (
            <ul className="grid gap-2">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 text-[13.5px]">
                  <span className="font-semibold">{formatDate(r.date)}</span>
                  <span className="grow text-muted-foreground">{times(r)}</span>
                  <Badge tone={FIX_TONE[r.status]}>
                    {r.status[0] + r.status.slice(1).toLowerCase()}
                  </Badge>
                  {r.canCancel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api(`/attendance/regularisations/${r.id}/cancel`, { method: 'POST' });
                        void load();
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !toDecide.length && (
              <Empty className="py-6">Nothing to fix. Missed a punch? Use “Fix a day”.</Empty>
            )
          )}
        </>
      )}
      <Dialog open={asking} onOpenChange={setAsking}>
        {asking && (
          <FixDialog
            onDone={(m) => {
              setAsking(false);
              onToast(m);
              void load();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function FixDialog({ onDone }: { onDone: (m: string) => void }) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(yesterday);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent title="Fix a day" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await api('/attendance/regularisations', {
              method: 'POST',
              body: JSON.stringify({
                date,
                checkIn: checkIn || null,
                checkOut: checkOut || null,
                reason,
              }),
            });
            onDone('Sent to your manager to approve');
          } catch (err) {
            setError(errorText(err, 'Could not send'));
            setBusy(false);
          }
        }}
      >
        <Field id="fx-date" label="Day">
          <Input
            id="fx-date"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fx-in" label="Check-in">
            <Input
              id="fx-in"
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </Field>
          <Field id="fx-out" label="Check-out">
            <Input
              id="fx-out"
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </Field>
        </div>
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Fill in only what’s missing or wrong. Days up to 30 days back.
        </p>
        <Field id="fx-why" label="What happened?">
          <Input
            id="fx-why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Forgot to punch out after the client call"
            required
          />
        </Field>
        <FormError>{error}</FormError>
        <Actions busy={busy}>Send for approval</Actions>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------- shifts

export function ShiftsCard({
  manage,
  onToast,
  onChanged,
}: {
  manage: boolean;
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [shifts, setShifts] = useState<ShiftItem[] | null>(null);
  const [dialog, setDialog] = useState<{ edit: ShiftItem | null } | { assign: ShiftItem } | null>(
    null,
  );
  const load = useCallback(() => {
    api<ShiftItem[]>('/attendance/shifts')
      .then(setShifts)
      .catch(() => setShifts([]));
  }, []);
  useEffect(load, [load]);
  const done = (m: string) => {
    setDialog(null);
    onToast(m);
    load();
    onChanged();
  };

  return (
    <Card id="shifts" className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Shifts</CardTitle>
          <CardDescription>Working hours, grace for late check-ins and weekly offs</CardDescription>
        </div>
        {manage && (
          <Button size="sm" onClick={() => setDialog({ edit: null })}>
            <Plus /> Add shift
          </Button>
        )}
      </CardHeader>
      {!shifts ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="grid gap-3">
          {shifts.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/50 p-3.5"
            >
              <div className="min-w-0 grow basis-56">
                <div className="flex items-center gap-2 font-bold">
                  {s.name} {s.isDefault && <Badge tone="accent">Default</Badge>}
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {s.startTime} – {s.endTime} · late after {s.graceMinutes} min · full day{' '}
                  {hours(s.fullDayMinutes)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {DAYS.map((d, i) => (
                    <span
                      key={d}
                      className={cn(
                        'rounded-md px-1.5 py-0.5 text-[11px] font-bold',
                        s.weeklyOffs.includes(i)
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface text-muted-foreground',
                      )}
                      title={s.weeklyOffs.includes(i) ? `${d}: off` : `${d}: working`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                <Users className="size-3.5" /> {s.people}
              </span>
              {manage && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ assign: s })}>
                    Assign people
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${s.name}`}
                    onClick={() => setDialog({ edit: s })}
                  >
                    <Pencil />
                  </Button>
                  {!s.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${s.name}`}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Remove ${s.name}? People on it move to the default shift.`,
                          )
                        )
                          return;
                        await api(`/attendance/shifts/${s.id}`, { method: 'DELETE' });
                        done(`Removed ${s.name}`);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog && 'edit' in dialog && <ShiftDialog shift={dialog.edit} onDone={done} />}
        {dialog && 'assign' in dialog && <AssignDialog shift={dialog.assign} onDone={done} />}
      </Dialog>
    </Card>
  );
}

function ShiftDialog({ shift, onDone }: { shift: ShiftItem | null; onDone: (m: string) => void }) {
  const [f, setF] = useState({
    name: shift?.name ?? '',
    startTime: shift?.startTime ?? '09:30',
    endTime: shift?.endTime ?? '18:30',
    graceMinutes: String(shift?.graceMinutes ?? 15),
    fullHours: String((shift?.fullDayMinutes ?? 480) / 60),
    halfHours: String((shift?.halfDayMinutes ?? 240) / 60),
    weeklyOffs: shift?.weeklyOffs ?? [0, 6],
    isDefault: shift?.isDefault ?? false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <DialogContent
      title={shift ? `Edit ${shift.name}` : 'Add shift'}
      side="right"
      aria-describedby={undefined}
    >
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const body = JSON.stringify({
            name: f.name,
            startTime: f.startTime,
            endTime: f.endTime,
            graceMinutes: Number(f.graceMinutes) || 0,
            fullDayMinutes: Math.round(Number(f.fullHours) * 60),
            halfDayMinutes: Math.round(Number(f.halfHours) * 60),
            weeklyOffs: f.weeklyOffs,
            ...(shift?.isDefault ? {} : { isDefault: f.isDefault }),
          });
          try {
            if (shift) await api(`/attendance/shifts/${shift.id}`, { method: 'PATCH', body });
            else await api('/attendance/shifts', { method: 'POST', body });
            onDone(`Saved ${f.name}`);
          } catch (err) {
            setError(errorText(err, 'Could not save the shift'));
            setBusy(false);
          }
        }}
      >
        <Field id="sh-name" label="Name">
          <Input
            id="sh-name"
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Night shift"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sh-start" label="Starts">
            <Input
              id="sh-start"
              type="time"
              value={f.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              required
            />
          </Field>
          <Field id="sh-end" label="Ends">
            <Input
              id="sh-end"
              type="time"
              value={f.endTime}
              onChange={(e) => set('endTime', e.target.value)}
              required
            />
          </Field>
          <Field id="sh-grace" label="Late after (minutes)">
            <Input
              id="sh-grace"
              type="number"
              min={0}
              max={240}
              value={f.graceMinutes}
              onChange={(e) => set('graceMinutes', e.target.value)}
            />
          </Field>
          <Field id="sh-full" label="Hours for a full day">
            <Input
              id="sh-full"
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={f.fullHours}
              onChange={(e) => set('fullHours', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">Weekly offs</span>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <Chip
                key={d}
                active={f.weeklyOffs.includes(i)}
                onClick={() =>
                  set(
                    'weeklyOffs',
                    f.weeklyOffs.includes(i)
                      ? f.weeklyOffs.filter((x) => x !== i)
                      : [...f.weeklyOffs, i],
                  )
                }
              >
                {d}
              </Chip>
            ))}
          </div>
        </div>
        {!shift?.isDefault && (
          <ToggleRow
            title="Default shift"
            caption="Everyone without a shift of their own follows this one"
            checked={f.isDefault}
            onCheckedChange={(v) => set('isDefault', v)}
          />
        )}
        <FormError>{error}</FormError>
        <Actions busy={busy}>Save shift</Actions>
      </form>
    </DialogContent>
  );
}

function AssignDialog({ shift, onDone }: { shift: ShiftItem; onDone: (m: string) => void }) {
  const people = usePeople();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  return (
    <DialogContent title={`Put people on ${shift.name}`} side="right" aria-describedby={undefined}>
      <div className="grid gap-4">
        <ul className="grid max-h-[55vh] gap-1 overflow-y-auto">
          {people.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/60">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={picked.has(p.id)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(p.id);
                      else n.delete(p.id);
                      return n;
                    })
                  }
                />
                <span className="grow font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.dept ?? ''}</span>
              </label>
            </li>
          ))}
        </ul>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button
            variant="primary"
            disabled={!picked.size}
            onClick={async () => {
              try {
                const r = await api<{ assigned: number }>(`/attendance/shifts/${shift.id}/assign`, {
                  method: 'POST',
                  body: JSON.stringify({ employeeIds: [...picked] }),
                });
                onDone(
                  `Moved ${r.assigned} ${r.assigned === 1 ? 'person' : 'people'} to ${shift.name}`,
                );
              } catch (err) {
                setError(errorText(err, 'Could not assign'));
              }
            }}
          >
            Assign {picked.size || ''}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

// ---------------------------------------------------------------- holidays

export function HolidaysCard({
  manage,
  onToast,
  onChanged,
}: {
  manage: boolean;
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<HolidayItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api<HolidayItem[]>(`/attendance/holidays?year=${year}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [year]);
  useEffect(load, [load]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card id="holidays" className="content-start">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Holidays
            <span className="flex gap-1">
              {[year - 1, year, year + 1].map((y) => (
                <Chip
                  key={y}
                  active={y === year}
                  onClick={() => setYear(y)}
                  className="h-7 px-2.5 text-xs"
                >
                  {y}
                </Chip>
              ))}
            </span>
          </CardTitle>
          <CardDescription>
            Days off for everyone, or for one location. Optional holidays are listed only.
          </CardDescription>
        </div>
        {manage && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const r = await api<{ added: number }>(
                  `/attendance/holidays/national?year=${year}`,
                  { method: 'POST' },
                );
                onToast(
                  r.added
                    ? `Added ${r.added} national holidays`
                    : 'National holidays are already there',
                );
                load();
                onChanged();
              }}
            >
              Add national holidays
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <CalendarPlus /> Add holiday
            </Button>
          </div>
        )}
      </CardHeader>
      {!rows ? (
        <Skeleton className="h-24" />
      ) : rows.length ? (
        <ul className="grid gap-2">
          {rows.map((h) => (
            <li
              key={h.id}
              className={cn('flex items-center gap-3', h.date < today && 'opacity-60')}
            >
              <span className="w-28 shrink-0 font-mono text-[13px]">{formatDate(h.date)}</span>
              <span className="grow font-semibold">
                {h.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })}
                  {h.location ? ` · ${h.location.name} only` : ''}
                </span>
              </span>
              {h.optional && <Badge tone="info">Optional</Badge>}
              {manage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${h.name}`}
                  onClick={async () => {
                    await api(`/attendance/holidays/${h.id}`, { method: 'DELETE' });
                    load();
                    onChanged();
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="py-6">No holidays for {year} yet.</Empty>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <HolidayDialog
            year={year}
            onDone={(m) => {
              setAdding(false);
              onToast(m);
              load();
              onChanged();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function HolidayDialog({ year, onDone }: { year: number; onDone: (m: string) => void }) {
  const [date, setDate] = useState(`${year}-01-01`);
  const [name, setName] = useState('');
  const [optional, setOptional] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<Named[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Named[]>('/org/locations')
      .then(setLocations)
      .catch(() => undefined);
  }, []);
  return (
    <DialogContent title="Add holiday" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/attendance/holidays', {
              method: 'POST',
              body: JSON.stringify({ date, name, optional, locationId: locationId || null }),
            });
            onDone(`Added ${name}`);
          } catch (err) {
            setError(errorText(err, 'Could not add the holiday'));
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="hd-date" label="Date">
            <Input
              id="hd-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <Field id="hd-name" label="Name">
            <Input
              id="hd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali"
              required
            />
          </Field>
        </div>
        {locations.length > 0 && (
          <Field id="hd-loc" label="Where">
            <Select id="hd-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Every location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} only
                </option>
              ))}
            </Select>
          </Field>
        )}
        <ToggleRow
          title="Optional holiday"
          caption="Listed for people to take as leave, not a day off for everyone"
          checked={optional}
          onCheckedChange={setOptional}
        />
        <FormError>{error}</FormError>
        <Actions>Add holiday</Actions>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------- biometric devices

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <code className="grow font-mono text-[13px] break-all">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

/** Where devices send punches: this API's own address. */
const apiOrigin = () =>
  typeof window === 'undefined'
    ? ''
    : `${window.location.protocol}//${window.location.hostname}:4000`;

export function DevicesCard({
  onToast,
  onChanged,
}: {
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const people = usePeople();
  const [devices, setDevices] = useState<DeviceItem[] | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedUser[]>([]);
  const [dialog, setDialog] = useState<
    'add' | { key: string; device: { name: string; serialNumber: string } } | null
  >(null);
  const [linkTo, setLinkTo] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<DeviceItem[]>('/attendance/devices')
      .then(setDevices)
      .catch(() => setDevices([]));
    api<UnmatchedUser[]>('/attendance/devices/unmatched')
      .then(setUnmatched)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  const seen = (iso: string | null) => {
    if (!iso) return 'Never connected';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    return mins < 2
      ? 'Online now'
      : mins < 60
        ? `Seen ${mins} min ago`
        : `Seen ${new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <Card id="devices" className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Biometric devices</CardTitle>
          <CardDescription>
            Fingerprint and face devices that send punches straight to the register
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog('add')}>
          <Plus /> Add device
        </Button>
      </CardHeader>
      {!devices ? (
        <Skeleton className="h-24" />
      ) : devices.length ? (
        <ul className="mb-4 grid gap-2.5">
          {devices.map((d) => {
            const online =
              d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 15 * 60_000;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/50 p-3.5"
              >
                <IconTile tone={!d.active ? 'detail' : online ? 'success' : 'warning'} size={40}>
                  <Fingerprint />
                </IconTile>
                <div className="min-w-0 grow basis-52">
                  <div className="font-bold">
                    {d.name}{' '}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {d.serialNumber}
                    </span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {d.active ? seen(d.lastSeenAt) : 'Switched off'} · {d.punchesToday} punches
                    today
                    {d.location ? ` · ${d.location.name}` : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(`Make a new key for ${d.name}? The old key stops working.`))
                      return;
                    const r = await api<{ key: string }>(`/attendance/devices/${d.id}/key`, {
                      method: 'POST',
                    });
                    setDialog({ key: r.key, device: d });
                  }}
                >
                  <KeyRound /> New key
                </Button>
                <Switch
                  aria-label={`${d.name} active`}
                  checked={d.active}
                  onCheckedChange={async (active) => {
                    await api(`/attendance/devices/${d.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ active }),
                    });
                    load();
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty className="py-6">No devices yet. Add one to start taking punches.</Empty>
      )}

      {unmatched.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-xs font-bold tracking-[0.1em] text-detail uppercase">Who is this?</h4>
          <p className="text-[13px] text-muted-foreground">
            These device user numbers have punched but aren’t linked to anyone. Link them and their
            days fill in.
          </p>
          <ul className="grid gap-2">
            {unmatched.map((u) => (
              <li key={u.deviceUserId} className="flex flex-wrap items-center gap-2">
                <span className="w-24 font-mono font-bold">#{u.deviceUserId}</span>
                <span className="text-xs text-muted-foreground">{u.punches} punches</span>
                <Select
                  aria-label={`Employee for device user ${u.deviceUserId}`}
                  className="h-9 min-w-44 grow basis-40"
                  value={linkTo[u.deviceUserId] ?? ''}
                  onChange={(e) => setLinkTo({ ...linkTo, [u.deviceUserId]: e.target.value })}
                >
                  <option value="">Pick a person</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={!linkTo[u.deviceUserId]}
                  onClick={async () => {
                    try {
                      const r = await api<{ linked: number; days: number }>(
                        '/attendance/devices/map',
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            deviceUserId: u.deviceUserId,
                            employeeId: linkTo[u.deviceUserId],
                          }),
                        },
                      );
                      onToast(
                        `Linked. ${r.days} ${r.days === 1 ? 'day' : 'days'} filled in from ${r.linked} punches.`,
                      );
                      load();
                      onChanged();
                    } catch (err) {
                      onToast(errorText(err, 'Could not link'));
                    }
                  }}
                >
                  <Link2 /> Link
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'add' && (
          <AddDevice
            onAdded={(r) => {
              setDialog(r);
              load();
            }}
          />
        )}
        {dialog && dialog !== 'add' && (
          <DialogContent
            title={`Connect ${dialog.device.name}`}
            side="right"
            aria-describedby={undefined}
          >
            <div className="grid gap-4 text-[13.5px]">
              <p className="rounded-2xl bg-warning/10 p-3.5">
                Copy the key now. It’s shown only once; if it’s lost, make a new one.
              </p>
              <CopyLine label="Device key" value={dialog.key} />
              <h4 className="mt-2 font-bold">ZKTeco, eSSL and other push devices</h4>
              <p className="text-muted-foreground">
                In the device menu, open Comm → Cloud server (ADMS) and enter this server address.
                The device is recognised by its serial number, {dialog.device.serialNumber}.
              </p>
              <CopyLine label="Server address" value={apiOrigin()} />
              <h4 className="mt-2 font-bold">Any other device or a bridge</h4>
              <p className="text-muted-foreground">
                Send punches as JSON with the key in the <code>X-Device-Key</code> header.
              </p>
              <CopyLine label="Punch API" value={`${apiOrigin()}/api/attendance/punches`} />
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs">
                {`{ "punches": [ { "userId": "1007", "time": "2026-10-23T09:12:00+05:30", "direction": "IN" } ] }`}
              </pre>
              <p className="text-muted-foreground">
                Then put each person’s device user number on them: punches from unknown numbers wait
                under “Who is this?”.
              </p>
              <DialogClose asChild>
                <Button variant="primary">Done</Button>
              </DialogClose>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function AddDevice({
  onAdded,
}: {
  onAdded: (r: { key: string; device: { name: string; serialNumber: string } }) => void;
}) {
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<Named[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Named[]>('/org/locations')
      .then(setLocations)
      .catch(() => undefined);
  }, []);
  return (
    <DialogContent title="Add a biometric device" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onAdded(
              await api('/attendance/devices', {
                method: 'POST',
                body: JSON.stringify({ name, serialNumber, locationId: locationId || null }),
              }),
            );
          } catch (err) {
            setError(errorText(err, 'Could not add the device'));
          }
        }}
      >
        <Field id="dv-name" label="Name">
          <Input
            id="dv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Front door, Bengaluru"
            required
          />
        </Field>
        <Field id="dv-sn" label="Serial number">
          <Input
            id="dv-sn"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="On the device’s label or System info screen"
            required
          />
        </Field>
        {locations.length > 0 && (
          <Field id="dv-loc" label="Location">
            <Select id="dv-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Not set</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <FormError>{error}</FormError>
        <Actions>Add device</Actions>
      </form>
    </DialogContent>
  );
}
