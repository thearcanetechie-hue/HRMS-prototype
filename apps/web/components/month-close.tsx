'use client';

import { CalendarCheck2, Loader2, Lock, LockOpen, Scale } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { ToggleRow } from './ui/bits';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { Skeleton } from './ui/progress';
import { api, ApiError, type Employee, type LeaveType, type Paged } from '@/lib/api';
import { formatDate, initials } from '@/lib/format';

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

interface CloseStatus {
  month: string;
  status: 'OPEN' | 'CLOSED';
  closedAt: string | null;
  canClose: boolean;
  unmarkedAs: 'A' | 'P';
  unmarkedDays: number;
  unmarked: {
    employee: { id: string; firstName: string; lastName: string };
    days: string[];
    lates: number;
    latePenaltyDays: number;
  }[];
}

/** HR closes a month's attendance before payroll; unmarked days are settled first. */
export function MonthCloseCard({
  month,
  onToast,
  onChanged,
}: {
  month: string;
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [s, setS] = useState<CloseStatus | null>(null);
  const [as, setAs] = useState<'A' | 'P'>('A');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<CloseStatus>(`/attendance/close?month=${month}`)
      .then((r) => {
        setS(r);
        setAs(r.unmarkedAs);
      })
      .catch(() => setS(null));
  }, [month]);
  useEffect(load, [load]);

  async function act(path: string, body: object, message: string) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      onToast(message);
      load();
      onChanged();
    } catch (err) {
      onToast(errorText(err, 'Could not do that'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="close" className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Close {monthLabel(month)}</CardTitle>
          <CardDescription>Settle unmarked days, then lock the month for payroll</CardDescription>
        </div>
        {s &&
          (s.status === 'CLOSED' ? (
            <Badge tone="success">Closed</Badge>
          ) : (
            <Badge tone="warning">Open</Badge>
          ))}
      </CardHeader>
      {!s ? (
        <Skeleton className="h-24" />
      ) : s.status === 'CLOSED' ? (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-muted-foreground">
            Closed {s.closedAt ? formatDate(s.closedAt) : ''}. Days in this month can’t change until
            it’s reopened, and it can’t be reopened once payroll is locked.
          </p>
          <Button
            size="sm"
            className="justify-self-start"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Reopen ${monthLabel(month)}? Changes will be allowed again.`))
                void act('/attendance/close/reopen', { month }, `${monthLabel(month)} reopened`);
            }}
          >
            <LockOpen /> Reopen month
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {s.unmarked.length ? (
            <ul className="grid max-h-72 gap-2 overflow-y-auto">
              {s.unmarked.map((r) => (
                <li key={r.employee.id} className="flex flex-wrap items-center gap-3 text-[13.5px]">
                  <Avatar
                    initials={initials(r.employee.firstName, r.employee.lastName)}
                    className="size-[30px] text-[11px]"
                  />
                  <span className="w-36 truncate font-semibold">
                    {r.employee.firstName} {r.employee.lastName}
                  </span>
                  {r.days.length > 0 && (
                    <span className="text-muted-foreground">
                      {r.days.length} unmarked {r.days.length === 1 ? 'day' : 'days'}
                    </span>
                  )}
                  {r.latePenaltyDays > 0 && (
                    <Badge tone="warning">
                      {r.lates} lates = {r.latePenaltyDays} unpaid
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">Every working day is marked.</p>
          )}
          {s.unmarkedDays > 0 && (
            <Field id="mc-as" label={`The ${s.unmarkedDays} unmarked days become`}>
              <Select id="mc-as" value={as} onChange={(e) => setAs(e.target.value as 'A' | 'P')}>
                <option value="A">Absent (unpaid)</option>
                <option value="P">Present</option>
              </Select>
            </Field>
          )}
          <Button
            variant="primary"
            className="justify-self-start"
            disabled={busy || !s.canClose}
            title={s.canClose ? undefined : 'A month can be closed once it has ended'}
            onClick={() =>
              act(
                '/attendance/close',
                { month, unmarkedAs: as },
                `${monthLabel(month)} closed for payroll`,
              )
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Lock />} Close {monthLabel(month)}
          </Button>
          {!s.canClose && (
            <p className="-mt-2 text-xs text-muted-foreground">
              You can close a month once it has ended.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** HR tools for balances: opening balances and corrections, and closing a leave year. */
export function LeaveAdminCard({
  types,
  onToast,
  onChanged,
}: {
  types: LeaveType[];
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<'adjust' | 'year' | null>(null);
  const done = (m: string) => {
    setDialog(null);
    onToast(m);
    onChanged();
  };
  return (
    <Card className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Leave balances</CardTitle>
          <CardDescription>Opening balances, corrections and the year-end close</CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setDialog('adjust')}>
          <Scale /> Adjust a balance
        </Button>
        <Button size="sm" onClick={() => setDialog('year')}>
          <CalendarCheck2 /> Close a leave year
        </Button>
      </div>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'adjust' && <AdjustDialog types={types} onDone={done} />}
        {dialog === 'year' && <YearEndDialog onDone={done} />}
      </Dialog>
    </Card>
  );
}

function AdjustDialog({ types, onDone }: { types: LeaveType[]; onDone: (m: string) => void }) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const limited = types.filter((t) => t.active && (t.daysPerYear !== null || t.isCompOff));
  const [employeeId, setEmployeeId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState(limited[0]?.id ?? '');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [days, setDays] = useState('1');
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => e.status !== 'EXITED')
            .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
        ),
      )
      .catch(() => undefined);
  }, []);
  return (
    <DialogContent title="Adjust a leave balance" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/leave/adjustments', {
              method: 'POST',
              body: JSON.stringify({
                employeeId: employeeId || people[0]?.id,
                leaveTypeId,
                year: Number(year),
                days: Number(days),
                kind: opening ? 'OPENING' : 'ADJUSTMENT',
                note,
              }),
            });
            onDone('Balance updated');
          } catch (err) {
            setError(errorText(err, 'Could not adjust'));
          }
        }}
      >
        <Field id="ad-who" label="Person">
          <Select
            id="ad-who"
            value={employeeId || people[0]?.id || ''}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="ad-type" label="Leave type">
            <Select
              id="ad-type"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
            >
              {limited.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="ad-year" label="Year">
            <Input
              id="ad-year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
          <Field id="ad-days" label="Days (+ or −)">
            <Input
              id="ad-days"
              type="number"
              step={0.5}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        </div>
        <ToggleRow
          title="Opening balance"
          caption="Leave they already had when you started using this system (once per type and year)"
          checked={opening}
          onCheckedChange={setOpening}
        />
        <Field id="ad-note" label="Why">
          <Input
            id="ad-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Balance from the old HR system"
            required
          />
        </Field>
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

function YearEndDialog({ onDone }: { onDone: (m: string) => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [encash, setEncash] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent title="Close a leave year" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const r = await api<{
              people: number;
              carried: number;
              lapsed: number;
              encashed: number;
            }>('/leave/year-end', {
              method: 'POST',
              body: JSON.stringify({ year: Number(year), encash }),
            });
            onDone(
              `Closed ${year}: ${r.carried} days carried forward, ${r.encashed} to be encashed, ${r.lapsed} lapsed`,
            );
          } catch (err) {
            setError(errorText(err, 'Could not close the year'));
            setBusy(false);
          }
        }}
      >
        <Field id="ye-year" label="Year">
          <Input
            id="ye-year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
        <p className="text-[13px] text-muted-foreground">
          For everyone, unused days carry forward up to each leave type’s limit. The rest lapse,
          unless you encash them below. This can only be done once per year.
        </p>
        <ToggleRow
          title="Encash what can’t be carried"
          caption="For encashable types, up to the yearly limit in the leave policy; paid in the next payroll"
          checked={encash}
          onCheckedChange={setEncash}
        />
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Close {year}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
