'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ProgressBar, Skeleton } from './ui/progress';
import { ProgressRing } from './ui/progress-ring';
import { api, type AttendanceRegister, type LeaveBalance } from '@/lib/api';

/** This month's attendance for one person, from the register. */
export function EmployeeAttendanceCard({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<
    | {
        present: number;
        working: number;
        late: number;
        absent: number;
        leave: number;
        month: string;
      }
    | null
    | 'hidden'
  >(null);

  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    api<AttendanceRegister>(`/attendance/register?month=${month}`)
      .then((r) => {
        const row = r.rows.find((x) => x.employee.id === employeeId);
        if (!row) return setState('hidden');
        const past = row.cells.filter((_, i) => r.days[i]! <= r.today);
        setState({
          present: row.present,
          working: row.workingDays,
          late: past.filter((c) => c.late).length,
          absent: past.filter((c) => c.code === 'A').length,
          leave: past.filter((c) => !['', 'W', 'P', 'A', 'HD'].includes(c.code)).length,
          month: new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long' }),
        });
      })
      .catch(() => setState('hidden'));
  }, [employeeId]);

  if (state === 'hidden') return null;
  if (!state) return <Skeleton className="h-48 rounded-2xl" />;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{state.month} attendance</CardTitle>
          <CardDescription>Working days so far this month</CardDescription>
        </div>
        <Link href="/attendance" className="text-[13px] font-bold">
          Register
        </Link>
      </CardHeader>
      <div className="flex flex-wrap items-center gap-6">
        <ProgressRing
          size={120}
          value={state.working ? (state.present / state.working) * 100 : 0}
          label="Attendance"
          caption={`${state.present}/${state.working} days`}
        />
        <dl className="grid grow gap-2">
          {(
            [
              ['Present', state.present],
              ['Late check-ins', state.late],
              ['Absent', state.absent],
              ['On leave', state.leave],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-mono text-[13px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/** Leave balances for one person this year. */
export function EmployeeLeaveCard({ employeeId }: { employeeId: string }) {
  const [balances, setBalances] = useState<LeaveBalance[] | null | 'hidden'>(null);
  useEffect(() => {
    api<LeaveBalance[]>(`/leave/balances?employeeId=${employeeId}`)
      .then(setBalances)
      .catch(() => setBalances('hidden'));
  }, [employeeId]);

  if (balances === 'hidden') return null;
  const limited = balances?.filter((b) => b.entitled !== null) ?? [];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Leave balance</CardTitle>
          <CardDescription>{new Date().getFullYear()}</CardDescription>
        </div>
      </CardHeader>
      {!balances ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="grid gap-3.5">
          {limited.map((b) => (
            <li key={b.leaveType.id} className="grid gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{b.leaveType.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {b.left} of {b.entitled} left{b.pending ? ` · ${b.pending} waiting` : ''}
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
      )}
    </Card>
  );
}
