'use client';

import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { DialogContent } from './ui/dialog';
import { Skeleton } from './ui/progress';
import { api, ApiError, type PayslipData } from '@/lib/api';
import { inr } from '@/lib/format';

export const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** A payslip in a dialog, laid out so it also prints cleanly. */
export function PayslipDialog({ id }: { id: string }) {
  const [p, setP] = useState<PayslipData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<PayslipData>(`/payroll/payslips/${id}`)
      .then(setP)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the payslip.'),
      );
  }, [id]);

  const earnings = p?.lines.filter((l) => l.kind === 'earning') ?? [];
  const deductions = p?.lines.filter((l) => l.kind === 'deduction') ?? [];
  const employer = p?.lines.filter((l) => l.kind === 'employer') ?? [];

  return (
    <DialogContent
      title={p ? `Payslip · ${monthName(p.month)}` : 'Payslip'}
      side="right"
      className="max-w-2xl"
      aria-describedby={undefined}
    >
      {error ? (
        <p className="text-danger">{error}</p>
      ) : !p ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5" id="payslip">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold">{p.company}</div>
              <div className="text-[13px] text-muted-foreground">
                Salary slip for {monthName(p.month)}
              </div>
            </div>
            <Button size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer /> Print or save as PDF
            </Button>
          </div>
          <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-surface-2/60 p-4 text-[13.5px] sm:grid-cols-2">
            {(
              [
                ['Name', p.employee.name],
                ['Employee code', p.employee.employeeCode],
                ['Designation', p.employee.designation ?? '–'],
                ['Department', p.employee.department ?? '–'],
                ['Location', p.employee.location ?? '–'],
                [
                  'Paid days',
                  `${p.payableDays} of ${p.daysInMonth}${p.lopDays ? ` (${p.lopDays} loss of pay)` : ''}`,
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-5 sm:grid-cols-2">
            <section>
              <h4 className="mb-2 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                Earnings
              </h4>
              <ul className="grid gap-1.5">
                {earnings.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="font-mono text-[13px]">{inr(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="mb-2 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                Deductions
              </h4>
              <ul className="grid gap-1.5">
                {deductions.map((l) => (
                  <li key={l.key} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="font-mono text-[13px]">{inr(l.amount)}</span>
                  </li>
                ))}
                {!deductions.length && <li className="text-muted-foreground">None</li>}
              </ul>
            </section>
          </div>
          <div className="grid gap-1.5 rounded-2xl bg-primary/8 p-4">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Gross pay</span>
              <span className="font-mono">{inr(p.gross)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Deductions</span>
              <span className="font-mono">− {inr(p.deductions)}</span>
            </div>
            {p.reimbursements > 0 && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Reimbursements</span>
                <span className="font-mono">+ {inr(p.reimbursements)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-lg font-extrabold">
              <span>Net pay</span>
              <span className="font-mono text-primary">{inr(p.net)}</span>
            </div>
          </div>
          {employer.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Paid by the company on top:{' '}
              {employer.map((l) => `${l.label} ${inr(l.amount)}`).join(' · ')}.
            </p>
          )}
        </div>
      )}
    </DialogContent>
  );
}
