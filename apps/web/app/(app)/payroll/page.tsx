'use client';

import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Unlock,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BonusCard,
  DeclarationsCard,
  MyTaxCard,
  PayItemsCard,
  SettlementCard,
  StatutoryFiles,
} from '@/components/payroll-compliance';
import { monthName, PayslipDialog } from '@/components/payslip';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Field, FormError, Input } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Stepper } from '@/components/ui/stepper';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  api,
  apiBlob,
  ApiError,
  type ComplianceItem,
  type PayrollRunData,
  type PayslipData,
  type SalaryInfo,
} from '@/lib/api';
import { formatDate, inr, inrShort, num } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const thisMonth = () => new Date().toISOString().slice(0, 7);
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const FILING: Record<ComplianceItem['status'], [string, BadgeTone]> = {
  open: ['Open', 'warning'],
  soon: ['Due soon', 'danger'],
  overdue: ['Overdue', 'danger'],
  filed: ['Done', 'success'],
};
const RUN_STATUS: Record<PayrollRunData['status'], [string, BadgeTone]> = {
  DRAFT: ['Draft', 'accent'],
  LOCKED: ['Locked', 'info'],
  PAID: ['Paid', 'success'],
};

export default function PayrollPage() {
  const { can } = useSession();
  return can('payroll.manage') ? <PayrollAdmin /> : <MyPayslips />;
}

/** What employees see: their own payslips. */
function MyPayslips() {
  const [slips, setSlips] = useState<PayslipData[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<PayslipData[]>('/payroll/my-payslips')
      .then(setSlips)
      .catch(() => setSlips([]));
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="My payslips"
        description="Your monthly salary slips, newest first."
      />
      <Card>
        {!slips ? (
          <Skeleton className="h-40" />
        ) : slips.length ? (
          <ul className="grid gap-2">
            {slips.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left hover:bg-surface-2/60"
                >
                  <IconTile size={36}>
                    <FileText />
                  </IconTile>
                  <span className="grow font-semibold">{monthName(s.month)}</span>
                  <span className="font-mono text-[13px]">{inr(s.net)}</span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No payslips yet. They appear here once HR runs payroll.</Empty>
        )}
      </Card>
      <div className="mt-5">
        <MyTaxCard />
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <PayslipDialog id={open} />}
      </Dialog>
    </>
  );
}

function PayrollAdmin() {
  const [month, setMonth] = useState(thisMonth);
  const [runs, setRuns] = useState<{ id: string; month: string }[] | null>(null);
  const [run, setRun] = useState<PayrollRunData | null>(null);
  const [compliance, setCompliance] = useState<ComplianceItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    'salaries' | 'pay' | { payslip: string } | { file: ComplianceItem } | null
  >(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      const list = await api<{ id: string; month: string }[]>('/payroll/runs');
      setRuns(list);
      const current = list.find((r) => r.month === month);
      setRun(current ? await api<PayrollRunData>(`/payroll/runs/${current.id}`) : null);
      setCompliance(await api<ComplianceItem[]>(`/payroll/compliance?month=${month}`));
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load payroll.'));
    }
  }, [month]);
  useEffect(() => {
    setRun(null);
    void load();
  }, [load]);

  async function act(path: string, done: string, body?: object) {
    setBusy(true);
    try {
      const r = await api<PayrollRunData>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setRun(r);
      showToast(done);
      setCompliance(await api<ComplianceItem[]>(`/payroll/compliance?month=${month}`));
      if (!runs?.some((x) => x.id === r.id))
        setRuns((rs) => [{ id: r.id, month: r.month }, ...(rs ?? [])]);
    } catch (err) {
      showToast(errorText(err, 'Could not do that'));
    } finally {
      setBusy(false);
      setDialog(null);
    }
  }

  async function bankFile() {
    if (!run) return;
    try {
      const blob = await apiBlob(`/payroll/runs/${run.id}/bank-file`);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), {
        href: url,
        download: `salaries-${run.month}.csv`,
      }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(errorText(err, 'Could not make the bank file'));
    }
  }

  const label = monthName(month);
  const allFiled =
    compliance?.filter((c) => c.period === month).every((c) => c.status === 'filed') ?? false;
  const stepDone = [
    run ? run.pendingOvertime + run.pendingClaims === 0 : false,
    !!run && run.unreviewed === 0 && run.payslips.length > 0,
    run?.status === 'LOCKED' || run?.status === 'PAID',
    run?.status === 'PAID',
    run?.status === 'PAID' && allFiled,
  ];
  const current = stepDone.findIndex((d) => !d);
  const flagged = run?.payslips.filter((p) => p.flags.length) ?? [];
  const split = run
    ? ([
        ['Net salaries', run.split.net, 'primary'],
        ['Income tax (TDS)', run.split.tds, 'detail'],
        ['Provident fund', run.split.pf, 'info'],
        ['ESI and professional tax', run.split.esiPt, 'warning'],
        ['Reimbursements', run.split.reimbursements, 'success'],
      ] as const)
    : [];
  const biggest = Math.max(1, ...split.map(([, v]) => v));
  const noSalary =
    run?.payslips.filter((p) => p.flags.some((f) => f.tag === 'No salary')).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Payroll & compliance"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="font-semibold text-foreground">{label}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={month >= thisMonth()}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            >
              <ChevronRight />
            </Button>
            {run && <Badge tone={RUN_STATUS[run.status][1]}>{RUN_STATUS[run.status][0]}</Badge>}
            {run && <span>· {run.payslips.length} people</span>}
          </span>
        }
        actions={
          <>
            <Button onClick={() => setDialog('salaries')}>
              <Users /> Salaries
            </Button>
            {!run ? (
              <Button
                variant="primary"
                disabled={busy || runs === null}
                onClick={() => act('/payroll/runs', `Started ${label} payroll`, { month })}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Play />} Start {label.split(' ')[0]}{' '}
                payroll
              </Button>
            ) : run.status === 'DRAFT' ? (
              <Button
                variant="primary"
                disabled={
                  busy || run.unreviewed > 0 || !run.payslips.length || !run.attendanceClosed
                }
                title={
                  !run.attendanceClosed
                    ? 'Close this month’s attendance first'
                    : run.unreviewed
                      ? 'Review the flagged payslips first'
                      : undefined
                }
                onClick={() =>
                  act(
                    `/payroll/runs/${run.id}/lock`,
                    'Payroll locked. Payslips are now visible to employees.',
                  )
                }
              >
                <Lock /> Lock payroll
              </Button>
            ) : run.status === 'LOCKED' ? (
              <Button variant="primary" disabled={busy} onClick={() => setDialog('pay')}>
                <Send /> Mark as paid
              </Button>
            ) : null}
          </>
        }
      />
      <Banner className="bg-warning/10 text-warning" tone="danger">
        These figures follow FY 2026-27 rules but must be checked by a chartered accountant before
        you pay anyone with them.
      </Banner>
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5">
        <Card className="py-5 sm:py-5">
          <Stepper
            steps={[
              { title: 'Approve overtime & claims' },
              { title: 'Review salaries' },
              { title: 'Lock payroll' },
              { title: 'Pay & payslips' },
              { title: 'File returns' },
            ]}
            current={current === -1 ? 5 : current}
          />
          {run && run.status === 'DRAFT' && !run.attendanceClosed && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              Payroll locks once {label} attendance is closed, so payslips match the register.{' '}
              <Link href="/attendance?tab=close">Close attendance</Link>, then recalculate.
            </p>
          )}
          {run && run.pendingOvertime + run.pendingClaims > 0 && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              {run.pendingOvertime} overtime and {run.pendingClaims} expense claims still need a
              decision. <Link href="/claims">Open claims</Link>, then recalculate.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard icon={<Wallet />} value={run ? inrShort(run.gross) : '–'} label="Gross pay" />
          <StatCard
            icon={<Send />}
            tone="success"
            value={run ? inrShort(run.net) : '–'}
            label="Net pay"
            delta={run ? `${run.payslips.length} people` : undefined}
          />
          <StatCard
            icon={<ShieldCheck />}
            tone="warning"
            value={run ? inrShort(run.statutory) : '–'}
            label="Statutory dues"
            delta={
              compliance?.find((c) => c.key === 'PF')
                ? `Due ${formatDate(compliance.find((c) => c.key === 'PF')!.due)}`
                : undefined
            }
            deltaTone="warning"
          />
          <StatCard
            icon={<Building2 />}
            tone="detail"
            value={run ? inrShort(run.ctc) : '–'}
            label="Cost to company"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Salary register</CardTitle>
                  <CardDescription>
                    {run
                      ? `${run.payslips.length} people · ${run.flagged} flagged`
                      : `No ${label} run yet`}
                  </CardDescription>
                </div>
                {run?.status === 'DRAFT' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act(
                        `/payroll/runs/${run.id}/recalculate`,
                        'Recalculated from the latest data',
                      )
                    }
                  >
                    <RefreshCw className={cn(busy && 'animate-spin')} /> Recalculate
                  </Button>
                )}
                {run?.status === 'LOCKED' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => act(`/payroll/runs/${run.id}/unlock`, 'Reopened for changes')}
                  >
                    <Unlock /> Reopen
                  </Button>
                )}
              </CardHeader>
              {runs === null || (runs.some((r) => r.month === month) && !run) ? (
                <Skeleton className="h-48" />
              ) : !run ? (
                <Empty className="py-10">
                  Start {label.split(' ')[0]} payroll to work out everyone’s pay from their salary,
                  attendance, leave, overtime and claims.
                </Empty>
              ) : (
                <Table bare>
                  <THead>
                    <tr>
                      <TH>Employee</TH>
                      {['Gross', 'PF', 'ESI', 'PT', 'TDS', 'Net pay'].map((h) => (
                        <TH key={h} className="text-right">
                          {h}
                        </TH>
                      ))}
                    </tr>
                  </THead>
                  <TBody>
                    {run.payslips.map((p) => (
                      <TR
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => setDialog({ payslip: p.id })}
                      >
                        <TD>
                          <button
                            type="button"
                            className="flex min-w-44 cursor-pointer items-center gap-3 text-left"
                            onClick={() => setDialog({ payslip: p.id })}
                          >
                            <Avatar
                              size="sm"
                              initials={
                                (p.employee.firstName[0] ?? '') + (p.employee.lastName[0] ?? '')
                              }
                            />
                            <span>
                              <span className="block font-bold whitespace-nowrap">
                                {p.employee.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {p.payableDays < p.daysInMonth
                                  ? `${p.payableDays}/${p.daysInMonth} days`
                                  : (p.employee.department ?? p.employee.employeeCode)}
                              </span>
                            </span>
                          </button>
                        </TD>
                        {[p.gross, p.pf, p.esi, p.pt, p.tds].map((v, i) => (
                          <TD key={i} className="text-right font-mono text-[13px]">
                            {v ? num(v) : '—'}
                          </TD>
                        ))}
                        <TD className="text-right font-mono text-[13px] font-bold">{num(p.net)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              {noSalary > 0 && (
                <p className="mt-3 text-[13px] text-danger">
                  {noSalary} {noSalary === 1 ? 'person has' : 'people have'} no salary set.{' '}
                  <button
                    type="button"
                    className="cursor-pointer font-bold underline"
                    onClick={() => setDialog('salaries')}
                  >
                    Set salaries
                  </button>
                </p>
              )}
            </Card>

            {flagged.length > 0 && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Flagged for review</CardTitle>
                    <CardDescription>Check these before you lock payroll</CardDescription>
                  </div>
                </CardHeader>
                <ul className="grid gap-3">
                  {flagged.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/70 p-3.5"
                    >
                      <Avatar
                        size="sm"
                        initials={(p.employee.firstName[0] ?? '') + (p.employee.lastName[0] ?? '')}
                      />
                      <div className="min-w-0 grow basis-48">
                        <div className="font-bold">{p.employee.name}</div>
                        <div className="text-[13px] text-muted-foreground">
                          {p.flags.map((f) => f.reason).join(' · ')}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.flags.map((f) => (
                          <Badge key={f.tag} tone={f.tone}>
                            {f.tag}
                          </Badge>
                        ))}
                      </div>
                      <Button size="sm" onClick={() => setDialog({ payslip: p.id })}>
                        Open
                      </Button>
                      <Button
                        size="sm"
                        disabled={p.reviewed || run?.status !== 'DRAFT' || busy}
                        onClick={() =>
                          act(
                            `/payroll/runs/${run!.id}/payslips/${p.id}/review`,
                            `Reviewed ${p.employee.name}`,
                          )
                        }
                      >
                        {p.reviewed ? (
                          <>
                            <Check /> Reviewed
                          </>
                        ) : (
                          'Mark reviewed'
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="grid content-start gap-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Compliance calendar</CardTitle>
                  <CardDescription>For {label}</CardDescription>
                </div>
              </CardHeader>
              {!compliance ? (
                <Skeleton className="h-48" />
              ) : (
                <ul className="grid gap-3">
                  {compliance.map((c) => (
                    <li key={c.key + c.period} className="flex items-center gap-3">
                      <div className="grid size-[52px] shrink-0 place-items-center content-center rounded-[14px] bg-surface-2 leading-none">
                        <span className="text-lg font-extrabold tabular">{c.due.slice(8)}</span>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                          {new Date(`${c.due}T00:00:00`).toLocaleDateString('en-IN', {
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="min-w-0 grow">
                        <div className="truncate font-semibold">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.status === 'filed'
                            ? `Done${c.reference ? ` · ${c.reference}` : ''}`
                            : c.dueInDays < 0
                              ? `${-c.dueInDays} days late`
                              : `Due in ${c.dueInDays} days`}
                          {c.amount ? ` · ${inr(c.amount)}` : ''}
                        </div>
                      </div>
                      {c.status === 'filed' ? (
                        <Badge tone="success">Done</Badge>
                      ) : (
                        <Button size="sm" onClick={() => setDialog({ file: c })}>
                          Mark done
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {run && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Where the money goes</CardTitle>
                    <CardDescription>
                      {label} · CTC {inrShort(run.ctc)}
                    </CardDescription>
                  </div>
                </CardHeader>
                <ul className="grid gap-3.5">
                  {split.map(([l, v, tone]) => (
                    <li key={l} className="grid gap-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{l}</span>
                        <span className="font-mono text-[13px] text-muted-foreground">
                          {inrShort(v)}
                        </span>
                      </div>
                      <ProgressBar value={(v / biggest) * 100} tone={tone} label={l} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <PayItemsCard
            month={month}
            locked={run?.status === 'LOCKED' || run?.status === 'PAID'}
            onChanged={showToast}
          />
          {run && run.status !== 'DRAFT' ? (
            <StatutoryFiles runId={run.id} month={month} onToast={showToast} />
          ) : (
            <BonusCard month={month} onChanged={showToast} />
          )}
          <DeclarationsCard month={month} />
          <SettlementCard onChanged={showToast} />
        </div>

        {run && run.status !== 'DRAFT' && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(
              [
                [
                  Landmark,
                  'Bank transfer file',
                  'CSV with account numbers and net pay for your bank upload',
                  bankFile,
                ],
                [
                  FileText,
                  'Payslips',
                  'Employees can see their payslips under Payroll',
                  () => setDialog({ payslip: run.payslips[0]!.id }),
                ],
                [
                  ShieldCheck,
                  'Statutory amounts',
                  `PF ${inrShort(run.split.pf)} · ESI and PT ${inrShort(run.split.esiPt)} · TDS ${inrShort(run.split.tds)}`,
                  () => undefined,
                ],
              ] as [LucideIcon, string, string, () => void][]
            ).map(([Icon, title, caption, onClick]) => (
              <button
                key={title}
                type="button"
                onClick={onClick}
                className="grid cursor-pointer gap-3 rounded-2xl bg-surface p-5 text-left shadow-raised transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <IconTile>
                    <Icon />
                  </IconTile>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-bold">{title}</div>
                  <div className="text-[13px] text-muted-foreground">{caption}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === 'salaries' && (
          <SalariesDialog
            onSaved={() => {
              showToast('Salary saved');
              if (run?.status === 'DRAFT')
                void act(
                  `/payroll/runs/${run.id}/recalculate`,
                  'Salary saved and payroll recalculated',
                );
            }}
          />
        )}
        {dialog === 'pay' && run && (
          <DialogContent title={`Mark ${label} as paid?`}>
            <DialogDescription className="mb-5 text-muted-foreground">
              Use this once the bank transfer of {inr(run.net)} to {run.payslips.length} people has
              gone through. Included overtime and claims are marked paid.
            </DialogDescription>
            <div className="flex gap-3">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => act(`/payroll/runs/${run.id}/paid`, `${label} payroll marked paid`)}
              >
                <Send /> Mark as paid
              </Button>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
            </div>
          </DialogContent>
        )}
        {dialog && typeof dialog === 'object' && 'payslip' in dialog && (
          <PayslipDialog id={dialog.payslip} />
        )}
        {dialog && typeof dialog === 'object' && 'file' in dialog && (
          <FiledDialog
            item={dialog.file}
            onDone={async () => {
              setDialog(null);
              showToast(`${dialog.file.name} marked done`);
              setCompliance(await api<ComplianceItem[]>(`/payroll/compliance?month=${month}`));
            }}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function FiledDialog({ item, onDone }: { item: ComplianceItem; onDone: () => void }) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title={`Mark ${item.name} done`} aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/payroll/compliance/filed', {
              method: 'POST',
              body: JSON.stringify({
                key: item.key,
                period: item.period,
                reference: reference || null,
              }),
            });
            onDone();
          } catch (err) {
            setError(errorText(err, 'Could not save'));
          }
        }}
      >
        <Field id="fl-ref" label="Challan or acknowledgement number (optional)">
          <Input
            id="fl-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="TRRN or receipt number"
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            <Check /> Mark done
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

type SalaryRow = {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department: { name: string } | null;
  salary: SalaryInfo | null;
};

function SalariesDialog({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<SalaryRow[] | null>(null);
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const load = () =>
    api<SalaryRow[]>('/payroll/salaries')
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, []);

  return (
    <DialogContent title="Salaries" side="right" className="max-w-2xl" aria-describedby={undefined}>
      {editing ? (
        <SalaryForm
          row={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
            onSaved();
          }}
        />
      ) : !rows ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setEditing(r)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-surface-2/50 p-3 text-left hover:bg-surface-2"
              >
                <Avatar size="sm" initials={(r.firstName[0] ?? '') + (r.lastName[0] ?? '')} />
                <span className="min-w-0 grow">
                  <span className="block truncate font-semibold">
                    {r.firstName} {r.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.department?.name ?? r.employeeCode}
                  </span>
                </span>
                {r.salary ? (
                  <span className="text-right">
                    <span className="block font-mono text-[13px]">
                      {inr(r.salary.annualCtc)} a year
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {inr(r.salary.monthlyGross)} gross a month
                    </span>
                  </span>
                ) : (
                  <Badge tone="danger">Not set</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  );
}

function SalaryForm({
  row,
  onCancel,
  onSaved,
}: {
  row: SalaryRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [ctc, setCtc] = useState(String(row.salary?.annualCtc ?? ''));
  const [basic, setBasic] = useState(String(row.salary?.basicPercent ?? 50));
  const [metro, setMetro] = useState(row.salary?.metro ?? false);
  const [from, setFrom] = useState(
    row.salary?.effectiveFrom ?? `${new Date().toISOString().slice(0, 7)}-01`,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/payroll/salaries/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          annualCtc: Math.round(Number(ctc)),
          basicPercent: Number(basic),
          metro,
          effectiveFrom: from,
        }),
      });
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="font-bold">
        {row.firstName} {row.lastName}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sf-ctc" label="Yearly CTC (₹)">
          <Input
            id="sf-ctc"
            type="number"
            min={10000}
            value={ctc}
            onChange={(e) => setCtc(e.target.value)}
            required
          />
        </Field>
        <Field id="sf-basic" label="Basic, % of gross">
          <Input
            id="sf-basic"
            type="number"
            min={30}
            max={80}
            value={basic}
            onChange={(e) => setBasic(e.target.value)}
          />
        </Field>
        <Field id="sf-from" label="From">
          <Input id="sf-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
      <ToggleRow
        title="Metro city"
        caption="HRA at 50% of basic for Mumbai, Delhi, Kolkata and Chennai; 40% elsewhere"
        checked={metro}
        onCheckedChange={setMetro}
      />
      <FormError>{error}</FormError>
      <div className="flex gap-3">
        <Button variant="primary" type="submit" disabled={busy || !ctc}>
          {busy && <Loader2 className="animate-spin" />}
          Save salary
        </Button>
        <Button type="button" onClick={onCancel}>
          Back
        </Button>
      </div>
    </form>
  );
}
