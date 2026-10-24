'use client';

import {
  BadgeCheck,
  Download,
  FileSpreadsheet,
  Gift,
  Loader2,
  LogOut,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { ToggleRow } from './ui/bits';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { Empty, IconTile } from './ui/page';
import { Skeleton } from './ui/progress';
import { api, ApiError, type Employee, type Paged } from '@/lib/api';
import { formatDate, inr } from '@/lib/format';

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;
const fyOf = (month: string) =>
  Number(month.slice(5)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;
const fyLabel = (fy: number) => `FY ${fy}-${String(fy + 1).slice(2)}`;
const quarterOf = (month: string) => {
  const m = Number(month.slice(5));
  return m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
};

function save(text: string, fileName: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function usePeople(includeExited = false) {
  const [people, setPeople] = useState<{ id: string; name: string; code: string }[]>([]);
  useEffect(() => {
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => includeExited || e.status !== 'EXITED')
            .map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`.trim(),
              code: e.employeeCode,
            })),
        ),
      )
      .catch(() => undefined);
  }, [includeExited]);
  return people;
}

// ---------------------------------------------------------------- statutory files

/** Downloads for the returns: PF ECR, ESI, PT/LWF for a locked run, and 24Q for its quarter. */
export function StatutoryFiles({
  runId,
  month,
  onToast,
}: {
  runId: string;
  month: string;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function get(key: string, path: string, type?: string) {
    setBusy(key);
    try {
      const r = await api<{ text?: string; csv?: string; fileName: string; missing?: string[] }>(
        path,
      );
      save(r.text ?? r.csv ?? '', r.fileName, type);
      onToast(
        r.missing?.length
          ? `Downloaded. ${r.missing.length} ${r.missing.length === 1 ? 'person is' : 'people are'} missing a number: ${r.missing.join(', ')}`
          : 'Downloaded',
      );
    } catch (err) {
      onToast(errorText(err, 'Could not make the file'));
    } finally {
      setBusy(null);
    }
  }
  const fy = fyOf(month);
  const q = quarterOf(month);
  const files: [string, string, string, string, string?][] = [
    [
      'ecr',
      'PF ECR',
      'Upload on the EPFO employer portal',
      `/payroll/runs/${runId}/ecr`,
      'text/plain',
    ],
    [
      'esi',
      'ESI contributions',
      'Monthly contribution upload for the ESIC portal',
      `/payroll/runs/${runId}/esi`,
    ],
    [
      'pt',
      'Professional tax and LWF',
      'By state, for the state returns',
      `/payroll/runs/${runId}/state-levies`,
    ],
    [
      '24q',
      `TDS 24Q · ${fyLabel(fy)} Q${q}`,
      'Annexure I data for your return utility (paid months only)',
      `/payroll/returns/24q?fyStart=${fy}&quarter=${q}`,
    ],
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Statutory files</CardTitle>
          <CardDescription>Ready to upload. Check them before filing.</CardDescription>
        </div>
      </CardHeader>
      <ul className="grid gap-2">
        {files.map(([key, title, caption, path, type]) => (
          <li key={key} className="flex items-center gap-3">
            <IconTile size={36}>
              <FileSpreadsheet />
            </IconTile>
            <div className="min-w-0 grow">
              <div className="font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground">{caption}</div>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={() => get(key, path, type)}>
              {busy === key ? <Loader2 className="animate-spin" /> : <Download />} Download
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- pay items

const ITEM_KINDS: [string, string, boolean][] = [
  ['INCENTIVE', 'Incentive', false],
  ['BONUS', 'Bonus', false],
  ['ARREARS', 'Arrears', false],
  ['OTHER_EARNING', 'Other earning', false],
  ['ADVANCE_RECOVERY', 'Salary advance recovery', true],
  ['LOAN_RECOVERY', 'Loan recovery', true],
  ['OTHER_DEDUCTION', 'Other deduction', true],
];

interface PayItemRow {
  id: string;
  kind: string;
  label: string;
  amount: number;
  taxable: boolean;
  settlementId: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
}

export function PayItemsCard({
  month,
  locked,
  onChanged,
}: {
  month: string;
  locked: boolean;
  onChanged: (m: string) => void;
}) {
  const [rows, setRows] = useState<PayItemRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api<PayItemRow[]>(`/payroll/items?month=${month}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [month]);
  useEffect(load, [load]);
  const deduction = (k: string) =>
    ITEM_KINDS.find((x) => x[0] === k)?.[2] ?? k === 'NOTICE_RECOVERY';
  return (
    <Card className="content-start">
      <CardHeader>
        <div>
          <CardTitle>One-off pay items</CardTitle>
          <CardDescription>
            Bonus, incentives, arrears and recoveries for this month
          </CardDescription>
        </div>
        {!locked && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        )}
      </CardHeader>
      {!rows ? (
        <Skeleton className="h-20" />
      ) : rows.length ? (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-[13.5px]">
              <span className="w-32 truncate font-semibold">
                {r.employee.firstName} {r.employee.lastName}
              </span>
              <span className="grow truncate text-muted-foreground">{r.label}</span>
              <span className={`font-mono ${deduction(r.kind) ? 'text-danger' : ''}`}>
                {deduction(r.kind) ? '−' : '+'}
                {inr(r.amount)}
              </span>
              {!locked && !r.settlementId && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${r.label}`}
                  onClick={async () => {
                    await api(`/payroll/items/${r.id}`, { method: 'DELETE' });
                    load();
                    onChanged('Removed. Recalculate payroll to update payslips.');
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="py-6">Nothing extra this month.</Empty>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <PayItemDialog
            month={month}
            onDone={() => {
              setAdding(false);
              load();
              onChanged('Added. Recalculate payroll to include it.');
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function PayItemDialog({ month, onDone }: { month: string; onDone: () => void }) {
  const people = usePeople();
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState('INCENTIVE');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [error, setError] = useState('');
  const isDeduction = ITEM_KINDS.find((x) => x[0] === kind)?.[2] ?? false;
  return (
    <DialogContent title="Add a pay item" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          try {
            await api('/payroll/items', {
              method: 'POST',
              body: JSON.stringify({
                employeeId: employeeId || people[0]?.id,
                month,
                kind,
                label: label || ITEM_KINDS.find((x) => x[0] === kind)?.[1],
                amount: Number(amount),
                taxable,
              }),
            });
            onDone();
          } catch (err) {
            setError(errorText(err, 'Could not add'));
          }
        }}
      >
        <Field id="pi-who" label="Person">
          <Select
            id="pi-who"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pi-kind" label="Type">
            <Select id="pi-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {ITEM_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="pi-amt" label="Amount (₹)">
            <Input
              id="pi-amt"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field id="pi-label" label="Shown on the payslip as">
          <Input
            id="pi-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={ITEM_KINDS.find((x) => x[0] === kind)?.[1]}
          />
        </Field>
        {!isDeduction && (
          <ToggleRow
            title="Taxable"
            caption="Counts toward income for TDS"
            checked={taxable}
            onCheckedChange={setTaxable}
          />
        )}
        <FormError>{error}</FormError>
        <Actions>Add</Actions>
      </form>
    </DialogContent>
  );
}

function Actions({ children, busy }: { children: ReactNode; busy?: boolean }) {
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

// ---------------------------------------------------------------- statutory bonus

export function BonusCard({ month, onChanged }: { month: string; onChanged: (m: string) => void }) {
  const fy = fyOf(month) - (Number(month.slice(5)) < 10 ? 1 : 0);
  const [preview, setPreview] = useState<{
    people: { employee: { firstName: string; lastName: string }; amount: number }[];
    total: number;
    rate: number;
  } | null>(null);
  const [error, setError] = useState('');
  async function run(add: boolean) {
    setError('');
    try {
      const r = await api<typeof preview>('/payroll/bonus', {
        method: 'POST',
        body: JSON.stringify({ fyStart: fy, month, preview: !add }),
      });
      setPreview(r);
      if (add)
        onChanged(
          `Bonus for ${fyLabel(fy)} added to this month. Recalculate payroll to include it.`,
        );
    } catch (err) {
      setError(errorText(err, 'Could not work out bonus'));
    }
  }
  return (
    <Card className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Statutory bonus</CardTitle>
          <CardDescription>
            Payment of Bonus Act · {fyLabel(fy)} · paid by 30 November
          </CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-3">
        {preview ? (
          preview.people.length ? (
            <>
              <p className="text-[13.5px] text-muted-foreground">
                {preview.people.length} eligible at {(preview.rate * 100).toFixed(2)}%, total{' '}
                {inr(preview.total)}.
              </p>
              <ul className="grid max-h-40 gap-1 overflow-y-auto text-[13.5px]">
                {preview.people.map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {p.employee.firstName} {p.employee.lastName}
                    </span>
                    <span className="font-mono">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" className="justify-self-start" onClick={() => run(true)}>
                <Gift /> Add to {formatDate(`${month}-01`).slice(3)} payroll
              </Button>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              Nobody is eligible from locked payroll in {fyLabel(fy)}.
            </p>
          )
        ) : (
          <Button size="sm" className="justify-self-start" onClick={() => run(false)}>
            <Gift /> Work out bonus
          </Button>
        )}
        <FormError>{error}</FormError>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- declarations (HR)

interface DeclRow {
  employee: { id: string; firstName: string; lastName: string; employeeCode: string };
  declaration: {
    id: string;
    regime: 'NEW' | 'OLD';
    verified: boolean;
    rentMonthly: number;
    sec80C: number;
  } | null;
}

export function DeclarationsCard({ month }: { month: string }) {
  const fy = fyOf(month);
  const [rows, setRows] = useState<DeclRow[] | null>(null);
  const load = useCallback(() => {
    api<DeclRow[]>(`/payroll/declarations?fyStart=${fy}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [fy]);
  useEffect(load, [load]);
  return (
    <Card className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Tax declarations</CardTitle>
          <CardDescription>
            Form 12BB · {fyLabel(fy)} · people fill these in under My payslips
          </CardDescription>
        </div>
      </CardHeader>
      {!rows ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="grid max-h-72 gap-2 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.employee.id} className="flex items-center gap-3 text-[13.5px]">
              <span className="grow truncate font-semibold">
                {r.employee.firstName} {r.employee.lastName}
              </span>
              {r.declaration ? (
                <>
                  <Badge tone={r.declaration.regime === 'OLD' ? 'warning' : 'info'}>
                    {r.declaration.regime === 'OLD' ? 'Old regime' : 'New regime'}
                  </Badge>
                  {r.declaration.verified ? (
                    <Badge tone="success">Verified</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api(`/payroll/declarations/${r.declaration!.id}/verify`, {
                          method: 'POST',
                        });
                        load();
                      }}
                    >
                      <BadgeCheck /> Verify proofs
                    </Button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Not declared · new regime</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- full and final

interface SettlementData {
  id: string;
  status: 'DRAFT' | 'FINAL';
  lastWorkingDay: string;
  data: {
    gratuity: { eligible: boolean; years: number; exactYears: number; amount: number };
    encashDays: number;
    encashment: number;
    shortDays: number;
    noticeRecovery: number;
    lines: { kind: string; label: string; amount: number }[];
    net: number;
  };
}

export function SettlementCard({ onChanged }: { onChanged: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="content-start">
      <CardHeader>
        <div>
          <CardTitle>Full and final settlement</CardTitle>
          <CardDescription>
            Gratuity, leave encashment and notice pay for someone leaving
          </CardDescription>
        </div>
      </CardHeader>
      <Button size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
        <LogOut /> Settle someone leaving
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <SettlementDialog
            onDone={(m) => {
              setOpen(false);
              onChanged(m);
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function SettlementDialog({ onDone }: { onDone: (m: string) => void }) {
  const people = usePeople();
  const [employeeId, setEmployeeId] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState(new Date().toISOString().slice(0, 10));
  const [served, setServed] = useState('30');
  const [waive, setWaive] = useState(false);
  const [fixedTerm, setFixedTerm] = useState(false);
  const [death, setDeath] = useState(false);
  const [result, setResult] = useState<SettlementData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const who = employeeId || people[0]?.id || '';
  return (
    <DialogContent title="Full and final settlement" side="right" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setResult(
              await api<SettlementData>('/payroll/settlements', {
                method: 'POST',
                body: JSON.stringify({
                  employeeId: who,
                  lastWorkingDay,
                  noticeServedDays: Number(served) || 0,
                  waiveNoticeRecovery: waive,
                  fixedTerm,
                  deathOrDisablement: death,
                }),
              }),
            );
          } catch (err) {
            setError(errorText(err, 'Could not work it out'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="st-who" label="Person">
          <Select
            id="st-who"
            value={who}
            onChange={(e) => (setEmployeeId(e.target.value), setResult(null))}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-lwd" label="Last working day">
            <Input
              id="st-lwd"
              type="date"
              value={lastWorkingDay}
              onChange={(e) => setLastWorkingDay(e.target.value)}
              required
            />
          </Field>
          <Field id="st-served" label="Notice days served">
            <Input
              id="st-served"
              type="number"
              min={0}
              value={served}
              onChange={(e) => setServed(e.target.value)}
            />
          </Field>
        </div>
        <ToggleRow title="Waive notice recovery" checked={waive} onCheckedChange={setWaive} />
        <ToggleRow
          title="Fixed-term employee"
          caption="Gratuity after one year (Code on Social Security)"
          checked={fixedTerm}
          onCheckedChange={setFixedTerm}
        />
        <ToggleRow
          title="Death or disablement"
          caption="Gratuity is due whatever the years of service"
          checked={death}
          onCheckedChange={setDeath}
        />
        <FormError>{error}</FormError>
        <Actions busy={busy}>
          <Scale /> Work it out
        </Actions>
      </form>
      {result && (
        <div className="mt-5 grid gap-3 rounded-2xl bg-surface-2/60 p-4 text-[13.5px]">
          <div className="font-bold">Settlement</div>
          <p className="text-muted-foreground">
            {result.data.gratuity.exactYears} years of service.{' '}
            {result.data.gratuity.eligible
              ? `Gratuity for ${result.data.gratuity.years} years.`
              : 'Not yet eligible for gratuity.'}
          </p>
          <ul className="grid gap-1">
            {result.data.lines.map((l) => (
              <li key={l.kind} className="flex justify-between">
                <span>{l.label}</span>
                <span className="font-mono">
                  {l.kind === 'NOTICE_RECOVERY' ? '−' : ''}
                  {inr(l.amount)}
                </span>
              </li>
            ))}
            <li className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
              <span>Settlement total</span>
              <span className="font-mono">{inr(result.data.net)}</span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            The last month’s salary comes from that month’s payroll. Finalising adds these lines to
            it and sets their exit date.
          </p>
          {result.status === 'DRAFT' ? (
            <Button
              variant="primary"
              className="justify-self-start"
              onClick={async () => {
                try {
                  await api(`/payroll/settlements/${who}/finalise`, { method: 'POST' });
                  onDone('Settlement final. Its lines are in the leaving month’s payroll.');
                } catch (err) {
                  setError(errorText(err, 'Could not finalise'));
                }
              }}
            >
              Finalise settlement
            </Button>
          ) : (
            <Badge tone="success">Final</Badge>
          )}
        </div>
      )}
    </DialogContent>
  );
}

// ---------------------------------------------------------------- my tax (employees)

interface MyDeclaration {
  id: string | null;
  regime: 'NEW' | 'OLD';
  verified: boolean;
  rentMonthly?: number;
  landlordPan?: string | null;
  sec80C?: number;
  sec80D?: number;
  sec80DParents?: number;
  parentsSenior?: boolean;
  sec80CCD1B?: number;
  homeLoanInterest?: number;
  otherDeductions?: number;
  previousEmployerIncome?: number;
  previousEmployerTds?: number;
}

const DECL_FIELDS: [keyof MyDeclaration, string, string][] = [
  ['rentMonthly', 'Rent a month', 'For HRA exemption'],
  ['sec80C', 'Section 80C', 'PPF, ELSS, life insurance, tuition fees… (your PF is added for you)'],
  ['sec80D', 'Section 80D: health insurance', 'You, spouse and children'],
  ['sec80DParents', 'Section 80D: parents', ''],
  ['sec80CCD1B', 'NPS, section 80CCD(1B)', 'Up to ₹ 50,000'],
  ['homeLoanInterest', 'Home loan interest, section 24(b)', 'Self-occupied, up to ₹ 2 lakh'],
  ['otherDeductions', 'Other deductions', '80E, 80G, 80TTA…'],
  ['previousEmployerIncome', 'Salary from an earlier employer this year', 'Form 12B'],
  ['previousEmployerTds', 'TDS by that employer', ''],
];

export function MyTaxCard() {
  const month = new Date().toISOString().slice(0, 7);
  const fy = fyOf(month);
  const [d, setD] = useState<MyDeclaration | null>(null);
  const [cmp, setCmp] = useState<{ newTax: number; oldTax: number; better: 'NEW' | 'OLD' } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const load = useCallback(() => {
    api<MyDeclaration>(`/payroll/declarations/mine?fyStart=${fy}`)
      .then(setD)
      .catch(() => undefined);
    api<typeof cmp>(`/payroll/declarations/compare?fyStart=${fy}`)
      .then(setCmp)
      .catch(() => undefined);
  }, [fy]);
  useEffect(load, [load]);
  if (!d) return <Skeleton className="h-40 rounded-2xl" />;
  const set = (k: keyof MyDeclaration, v: unknown) => setD({ ...d, [k]: v });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>My tax declaration</CardTitle>
          <CardDescription>
            Form 12BB · {fyLabel(fy)} · decides how much tax is deducted each month
          </CardDescription>
        </div>
        {d.verified && <Badge tone="success">Verified by payroll</Badge>}
      </CardHeader>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setSaved('');
          try {
            const { id: _i, verified: _v, ...rest } = d;
            const body = Object.fromEntries(
              Object.entries(rest).filter(
                ([k]) =>
                  DECL_FIELDS.some(([f]) => f === k) ||
                  ['regime', 'landlordPan', 'parentsSenior'].includes(k),
              ),
            );
            await api('/payroll/declarations', {
              method: 'PUT',
              body: JSON.stringify({ ...body, fyStart: fy }),
            });
            setSaved('Saved. Next month’s tax uses it.');
            load();
          } catch (err) {
            setError(errorText(err, 'Could not save'));
          }
        }}
      >
        <Field id="tx-regime" label="Tax regime">
          <Select id="tx-regime" value={d.regime} onChange={(e) => set('regime', e.target.value)}>
            <option value="NEW">New regime (default): lower rates, few deductions</option>
            <option value="OLD">Old regime: HRA, 80C, 80D and home loan deductions</option>
          </Select>
        </Field>
        {cmp && (
          <p className="-mt-2 text-[13px] text-muted-foreground">
            On your current salary and declaration: new regime {inr(cmp.newTax)}, old regime{' '}
            {inr(cmp.oldTax)} a year. The {cmp.better === 'NEW' ? 'new' : 'old'} regime costs less.
          </p>
        )}
        {d.regime === 'OLD' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {DECL_FIELDS.map(([k, label, help]) => (
              <Field key={k} id={`tx-${k}`} label={label}>
                <Input
                  id={`tx-${k}`}
                  type="number"
                  min={0}
                  value={String(d[k] ?? 0)}
                  onChange={(e) => set(k, Number(e.target.value) || 0)}
                  title={help}
                />
              </Field>
            ))}
            {(d.rentMonthly ?? 0) * 12 > 1_00_000 && (
              <Field id="tx-ll" label="Landlord’s PAN (rent over ₹ 1 lakh a year)">
                <Input
                  id="tx-ll"
                  value={d.landlordPan ?? ''}
                  onChange={(e) => set('landlordPan', e.target.value.toUpperCase())}
                />
              </Field>
            )}
          </div>
        )}
        {d.regime === 'OLD' && (
          <ToggleRow
            title="Parents are senior citizens"
            caption="Raises the 80D limit for parents to ₹ 50,000"
            checked={Boolean(d.parentsSenior)}
            onCheckedChange={(v) => set('parentsSenior', v)}
          />
        )}
        <FormError>{error}</FormError>
        {saved && <p className="text-[13px] font-semibold text-success">{saved}</p>}
        <Button
          variant="primary"
          type="submit"
          className="justify-self-start"
          disabled={d.verified}
        >
          Save declaration
        </Button>
      </form>
    </Card>
  );
}
