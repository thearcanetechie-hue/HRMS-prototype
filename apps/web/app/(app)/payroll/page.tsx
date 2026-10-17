'use client';

import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  Download,
  Eye,
  FileText,
  Landmark,
  Mail,
  Play,
  Send,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Banner, DemoBadge, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Stepper } from '@/components/ui/stepper';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { getPayrollOverview, type ComplianceItem, type PayrollOverview } from '@/lib/demo/payroll';
import { inrShort, num } from '@/lib/format';

const STEPS = [
  { title: 'Lock attendance' },
  { title: 'Approve overtime & claims' },
  { title: 'Review salaries' },
  { title: 'Pay & payslips' },
  { title: 'File returns' },
];

const COMPLIANCE: Record<ComplianceItem['status'], [string, BadgeTone]> = {
  open: ['Open', 'warning'],
  soon: ['Soon', 'danger'],
  filed: ['Filed', 'success'],
};

const SHORTCUTS: [LucideIcon, string, string][] = [
  [Mail, 'Payslips', 'Email 128 payslips with a password'],
  [Landmark, 'Bank transfer file', 'HDFC, ICICI, SBI and Axis formats'],
  [FileText, 'Statutory reports', 'ECR, ESI, PT, Form 24Q and Form 16'],
  [Wallet, 'Full and final', '2 settlements pending'],
];

const money = (n: number | null) => (n === null ? '—' : num(n));

export default function PayrollPage() {
  const [data, setData] = useState<PayrollOverview | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getPayrollOverview().then(setData);
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Money" title="Payroll & compliance" />
        <div className="grid gap-5">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </>
    );

  const { run } = data;
  const flagged = data.salaries.filter((s) => s.flag);
  const openFlags = flagged.filter((s) => !reviewed.has(s.employeeId));
  const reviewDone = run.step > 3 || (run.step === 3 && openFlags.length === 0);
  const current = run.step === 3 && reviewDone ? 3 : run.step - 1;
  const rows = flaggedOnly ? flagged : data.salaries;
  const ctcTotal = data.split.reduce((a, s) => a + s.amount, 0);
  const biggest = Math.max(...data.split.map((s) => s.amount));

  function runPayroll() {
    setData((d) => d && { ...d, run: { ...d.run, step: 4 } });
    setConfirming(false);
  }

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Payroll & compliance <DemoBadge />
          </span>
        }
        description={`${run.month} · ${run.employees} employees · pay date ${run.payDate}.`}
        actions={
          <>
            <Button onClick={() => showToast('Payslip preview is coming soon')}>
              <Eye /> Preview payslips
            </Button>
            <Button
              variant="primary"
              disabled={!reviewDone || run.step > 3}
              title={!reviewDone ? 'Review the flagged salaries first' : undefined}
              onClick={() => setConfirming(true)}
            >
              <Play /> Run payroll
            </Button>
          </>
        }
      />

      {run.step >= 4 && (
        <Banner tone="success">
          Payroll run for {run.month.split(' ')[0]}. Payslips are ready to send.
        </Banner>
      )}

      <div className="grid gap-5">
        <Card className="py-5 sm:py-5">
          <Stepper steps={STEPS} current={current} />
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard icon={<Wallet />} value={inrShort(run.gross)} label="Gross pay" delta="+2.4%" />
          <StatCard
            icon={<Send />}
            tone="success"
            value={inrShort(run.net)}
            label="Net pay"
            delta={`${run.employees} people`}
          />
          <StatCard
            icon={<ShieldCheck />}
            tone="warning"
            value={inrShort(run.statutory)}
            label="Statutory dues"
            delta="Due 15 Nov"
            deltaTone="warning"
          />
          <StatCard
            icon={<Building2 />}
            tone="detail"
            value={inrShort(run.ctc)}
            label="Cost to company"
            delta="+1.8%"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Salary register</CardTitle>
                  <CardDescription>
                    {run.employees} employees · {flagged.length} flagged for review
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Chip active={flaggedOnly} onClick={() => setFlaggedOnly((f) => !f)}>
                    <AlertTriangle /> Flagged {flagged.length}
                  </Chip>
                  <Button size="sm" className="h-9" disabled title="Coming soon">
                    <Download /> Download
                  </Button>
                </div>
              </CardHeader>
              {data.attendanceLocked ? (
                <div>
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
                      {rows.map((s) => (
                        <TR key={s.employeeId}>
                          <TD>
                            <div className="flex min-w-44 items-center gap-3">
                              <Avatar size="sm" initials={s.initials} />
                              <div>
                                <div className="font-bold whitespace-nowrap">{s.name}</div>
                                <div className="text-xs text-muted-foreground">{s.team}</div>
                              </div>
                            </div>
                          </TD>
                          {[s.gross, s.pf, s.esi, s.pt, s.tds].map((v, i) => (
                            <TD key={i} className="text-right font-mono text-[13px]">
                              {money(v)}
                            </TD>
                          ))}
                          <TD className="text-right font-mono text-[13px] font-bold">
                            {money(s.net)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ) : (
                <div className="grid justify-items-center gap-3">
                  <Empty className="pb-2">Lock October attendance to see salaries</Empty>
                  <Button asChild>
                    <Link href="/attendance">Go to attendance</Link>
                  </Button>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Flagged for review</CardTitle>
                  <CardDescription>Check these before you run payroll</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3">
                {flagged.map((s) => {
                  const done = reviewed.has(s.employeeId) || run.step > 3;
                  return (
                    <li
                      key={s.employeeId}
                      className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/70 p-3.5"
                    >
                      <Avatar size="sm" initials={s.initials} />
                      <div className="min-w-0 grow basis-48">
                        <div className="font-bold">{s.name}</div>
                        <div className="text-[13px] text-muted-foreground">{s.flag!.reason}</div>
                      </div>
                      <Badge tone={s.flag!.tone}>{s.flag!.tag}</Badge>
                      <Button
                        size="sm"
                        disabled={done}
                        onClick={() => {
                          setReviewed((r) => new Set(r).add(s.employeeId));
                          showToast(`Marked ${s.name} as reviewed`);
                        }}
                      >
                        {done ? (
                          <>
                            <Check /> Reviewed
                          </>
                        ) : (
                          'Review'
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="grid content-start gap-5">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Compliance calendar</CardTitle>
                  <CardDescription>Karnataka · FY 2026–27</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3">
                {data.compliance.map((c) => (
                  <li key={c.name} className="flex items-center gap-3">
                    <div className="grid size-[52px] shrink-0 place-items-center content-center rounded-[14px] bg-surface-2 leading-none">
                      <span className="text-lg font-extrabold tabular">{c.day}</span>
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                        {c.month}
                      </span>
                    </div>
                    <div className="min-w-0 grow">
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.status === 'filed' ? 'Done for this year' : `Due in ${c.dueInDays} days`}
                      </div>
                    </div>
                    <Badge tone={COMPLIANCE[c.status][1]}>{COMPLIANCE[c.status][0]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Where the money goes</CardTitle>
                  <CardDescription>October CTC {inrShort(ctcTotal)}</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3.5">
                {data.split.map((s) => (
                  <li key={s.label} className="grid gap-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{s.label}</span>
                      <span className="font-mono text-[13px] text-muted-foreground">
                        {inrShort(s.amount)}
                      </span>
                    </div>
                    <ProgressBar value={(s.amount / biggest) * 100} tone={s.tone} label={s.label} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SHORTCUTS.map(([Icon, title, caption]) => (
            <button
              key={title}
              type="button"
              onClick={() => showToast(`${title} is coming soon`)}
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
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={`Run ${run.month.split(' ')[0]} payroll?`}>
          <DialogDescription className="mb-5 text-muted-foreground">
            This pays {run.employees} people {inrShort(run.net)} in total on {run.payDate} and
            prepares their payslips. These are sample figures: have a chartered accountant check the
            calculations before any live run.
          </DialogDescription>
          <div className="flex gap-3">
            <Button variant="primary" onClick={runPayroll}>
              <Play /> Run payroll
            </Button>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      <Toast message={toast} />
    </>
  );
}
