'use client';

import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileImage,
  IndianRupee,
  Loader2,
  Pause,
  Plus,
  Receipt,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { downloadDocument } from '@/components/documents';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileDrop, Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  api,
  ApiError,
  uploadDocument,
  type ClaimCategory,
  type ClaimPerson,
  type ClaimStatus,
  type ClaimsSummary,
  type Employee,
  type ExpenseItem,
  type OvertimeItem,
  type Paged,
} from '@/lib/api';
import { formatDate, initials, inr, inrShort, titleCase } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const STATUS_FILTERS: (ClaimStatus | '')[] = ['PENDING', 'APPROVED', 'PAID', 'REJECTED', ''];
const TONE: Record<ClaimStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  PAID: 'info',
  REJECTED: 'danger',
  ON_HOLD: 'danger',
};
const statusLabel = (s: ClaimStatus) => (s === 'ON_HOLD' ? 'On hold' : titleCase(s));
const nameOf = (p: ClaimPerson) => `${p.firstName} ${p.lastName}`.trim();
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

function PersonCell({ person }: { person: ClaimPerson }) {
  return (
    <div className="flex min-w-40 items-center gap-2.5">
      <Avatar size="sm" initials={initials(person.firstName, person.lastName)} />
      <div>
        <div className="font-bold whitespace-nowrap">{nameOf(person)}</div>
        <div className="text-xs text-muted-foreground">
          {person.department?.name ?? person.employeeCode}
        </div>
      </div>
    </div>
  );
}

type Dialogs =
  | { kind: 'overtime' }
  | { kind: 'expense' }
  | { kind: 'reject'; type: 'overtime' | 'expense'; ids: string[] }
  | { kind: 'categories' }
  | null;

export default function ClaimsPage() {
  const { can } = useSession();
  const manage = can('claims.manage');
  const [tab, setTab] = useState('overtime');
  const [status, setStatus] = useState<ClaimStatus | ''>('PENDING');
  const [summary, setSummary] = useState<ClaimsSummary | null>(null);
  const [overtime, setOvertime] = useState<OvertimeItem[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claimId, setClaimId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      const [s, o, e] = await Promise.all([
        api<ClaimsSummary>('/claims/summary'),
        api<OvertimeItem[]>('/claims/overtime'),
        api<ExpenseItem[]>('/claims/expenses'),
      ]);
      setSummary(s);
      setOvertime(o);
      setExpenses(e);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load claims.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const match = (s: ClaimStatus) =>
    !status || s === status || (status === 'PENDING' && s === 'ON_HOLD');
  const otRows = (overtime ?? []).filter((o) => match(o.status));
  const exRows = (expenses ?? []).filter((e) => match(e.status));
  const claim = expenses?.find((e) => e.id === claimId) ?? exRows[0] ?? null;
  const decidable = otRows.filter((o) => o.canDecide);
  const pendingCount =
    (overtime ?? []).filter((o) => o.status === 'PENDING').length +
    (expenses ?? []).filter((e) => e.status === 'PENDING' || e.status === 'ON_HOLD').length;
  const biggestSpend = Math.max(1, ...(summary?.spendByCategory.map((s) => s.amount) ?? [1]));

  async function decide(
    type: 'overtime' | 'expense',
    ids: string[],
    decision: 'APPROVE' | 'REJECT' | 'HOLD' | 'PAID',
    note?: string,
  ) {
    try {
      await api(`/claims/${type}/decision`, {
        method: 'POST',
        body: JSON.stringify({ ids, decision, note: note || null }),
      });
      const verb = {
        APPROVE: 'Approved',
        REJECT: 'Declined',
        HOLD: 'Put on hold',
        PAID: 'Marked paid',
      }[decision];
      showToast(`${verb} ${ids.length} ${ids.length === 1 ? 'claim' : 'claims'}`);
      setSelected(new Set());
      setDialog(null);
      await load();
    } catch (err) {
      showToast(errorText(err, 'Could not update'));
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Overtime & reimbursements"
        description="Extra hours and expense claims. Approved overtime and claims are paid with the next payroll."
        actions={
          <>
            {manage && (
              <Button onClick={() => setDialog({ kind: 'categories' })}>
                <Settings /> Claim limits
              </Button>
            )}
            <Button onClick={() => setDialog({ kind: 'overtime' })}>
              <Clock /> Log overtime
            </Button>
            {selected.size > 0 ? (
              <Button
                variant="primary"
                onClick={() => decide('overtime', [...selected], 'APPROVE')}
              >
                <Check /> Approve selected ({selected.size})
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setDialog({ kind: 'expense' })}>
                <Plus /> New expense claim
              </Button>
            )}
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overtime">Overtime</TabsTrigger>
            <TabsTrigger value="claims">Expense claims</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          {STATUS_FILTERS.map((s) => (
            <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)}>
              {s ? statusLabel(s) : 'All'}
              {s === 'PENDING' && (
                <span className="font-mono text-xs opacity-80">{pendingCount}</span>
              )}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<Clock />}
            tone="warning"
            value={summary ? `${summary.overtimeHours} h` : '–'}
            label="Overtime this month"
            delta={summary ? `${summary.overtimeApprovedHours} h approved` : undefined}
            deltaTone="success"
          />
          <StatCard
            icon={<Receipt />}
            tone="warning"
            value={summary ? inrShort(summary.pendingAmount) : '–'}
            label="Claims waiting"
            delta={summary ? `${summary.pendingClaims} claims` : undefined}
            deltaTone="warning"
          />
          <StatCard
            icon={<Wallet />}
            value={summary ? inrShort(summary.monthSpend) : '–'}
            label="Claimed this month"
          />
          <StatCard
            icon={<CheckCircle2 />}
            tone="success"
            value={summary?.avgApprovalDays != null ? `${summary.avgApprovalDays} days` : '–'}
            label="Avg time to decide"
            delta="Last 90 days"
            deltaTone="info"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          {tab === 'overtime' ? (
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Overtime</CardTitle>
                  <CardDescription>
                    Paid at 2× hourly basic with payroll, once approved
                  </CardDescription>
                </div>
                {decidable.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.size === decidable.length
                          ? new Set()
                          : new Set(decidable.map((o) => o.id)),
                      )
                    }
                  >
                    {selected.size === decidable.length
                      ? 'Clear selection'
                      : `Select all ${decidable.length}`}
                  </Button>
                )}
              </CardHeader>
              {!overtime ? (
                <Skeleton className="h-48" />
              ) : otRows.length ? (
                <Table bare>
                  <THead>
                    <tr>
                      <TH className="w-7 pr-0">
                        <span className="sr-only">Select</span>
                      </TH>
                      <TH>Employee</TH>
                      <TH>Date</TH>
                      <TH className="text-right">Hours</TH>
                      <TH>Reason</TH>
                      <TH>Status</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {otRows.map((o) => (
                      <TR key={o.id}>
                        <TD className="pr-0">
                          {o.canDecide && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${nameOf(o.employee)}, ${o.date}`}
                              className="size-4 cursor-pointer accent-primary"
                              checked={selected.has(o.id)}
                              onChange={() => toggle(o.id)}
                            />
                          )}
                        </TD>
                        <TD>
                          <PersonCell person={o.employee} />
                        </TD>
                        <TD className="whitespace-nowrap">{formatDate(o.date)}</TD>
                        <TD className="text-right font-mono text-[13px]">{o.hours.toFixed(1)}</TD>
                        <TD className="min-w-40">{o.reason}</TD>
                        <TD>
                          <Badge tone={TONE[o.status]}>{statusLabel(o.status)}</Badge>
                        </TD>
                        <TD>
                          {o.canDecide && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Decline ${nameOf(o.employee)}’s overtime`}
                              onClick={() =>
                                setDialog({ kind: 'reject', type: 'overtime', ids: [o.id] })
                              }
                            >
                              <X />
                            </Button>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <Empty className="py-10">
                  No {status ? statusLabel(status).toLowerCase() : ''} overtime
                </Empty>
              )}
            </Card>
          ) : (
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Expense claims</CardTitle>
                  <CardDescription>
                    {summary
                      ? `${summary.pendingClaims} waiting · ${inr(summary.pendingAmount)}`
                      : 'Loading…'}
                  </CardDescription>
                </div>
              </CardHeader>
              {!expenses ? (
                <Skeleton className="h-48" />
              ) : exRows.length ? (
                <Table bare>
                  <THead>
                    <tr>
                      <TH>Employee</TH>
                      <TH>Category</TH>
                      <TH>Spent on</TH>
                      <TH>Receipt</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {exRows.map((c) => (
                      <TR
                        key={c.id}
                        aria-selected={c.id === claim?.id}
                        className={cn(
                          'cursor-pointer',
                          c.id === claim?.id && 'bg-primary/6 even:bg-primary/6',
                        )}
                        onClick={() => setClaimId(c.id)}
                      >
                        <TD>
                          <button
                            type="button"
                            className="cursor-pointer text-left"
                            onClick={() => setClaimId(c.id)}
                          >
                            <PersonCell person={c.employee} />
                          </button>
                        </TD>
                        <TD className="whitespace-nowrap">{c.category.name}</TD>
                        <TD className="whitespace-nowrap">{formatDate(c.spentOn)}</TD>
                        <TD>
                          <Badge
                            tone={
                              c.receiptDocumentId
                                ? 'success'
                                : c.category.needsReceipt
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {c.receiptDocumentId ? 'Attached' : 'None'}
                          </Badge>
                        </TD>
                        <TD className="text-right font-mono text-[13px] whitespace-nowrap">
                          {inr(c.amount)}
                        </TD>
                        <TD>
                          <Badge tone={TONE[c.status]}>{statusLabel(c.status)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <Empty className="py-10">
                  No {status ? statusLabel(status).toLowerCase() : ''} claims
                </Empty>
              )}
            </Card>
          )}

          <div className="grid content-start gap-5">
            {tab === 'claims' && claim && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Claim detail</CardTitle>
                    <CardDescription>
                      {nameOf(claim.employee)} · {claim.category.name}
                    </CardDescription>
                  </div>
                  <Badge tone={TONE[claim.status]}>{statusLabel(claim.status)}</Badge>
                </CardHeader>
                <div className="mb-4 flex items-center gap-3 rounded-[14px] bg-surface-2 p-3 shadow-inset-sm">
                  <IconTile tone={claim.receiptDocumentId ? 'detail' : 'danger'} size={44}>
                    <FileImage />
                  </IconTile>
                  <div className="min-w-0 grow">
                    <div className="truncate font-semibold">
                      {claim.receiptDocumentId ? 'Receipt attached' : 'No receipt'}
                    </div>
                    <div
                      className={cn(
                        'text-xs',
                        claim.receiptDocumentId ? 'text-muted-foreground' : 'text-danger',
                      )}
                    >
                      {claim.receiptDocumentId
                        ? 'Kept in their documents'
                        : claim.category.needsReceipt
                          ? 'Ask for the receipt before approving'
                          : 'Not needed for this category'}
                    </div>
                  </div>
                  {claim.receiptDocumentId && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Download receipt"
                      onClick={() =>
                        downloadDocument({
                          id: claim.receiptDocumentId!,
                          name: `receipt-${claim.spentOn}`,
                        }).catch(() => showToast('Could not download the receipt'))
                      }
                    >
                      <Download />
                    </Button>
                  )}
                </div>
                <dl className="mb-5 grid gap-2.5">
                  {(
                    [
                      ['What for', claim.description],
                      ['Spent on', formatDate(claim.spentOn)],
                      ['Amount', inr(claim.amount)],
                      [
                        'Limit',
                        claim.category.limitPerClaim
                          ? `${inr(claim.category.limitPerClaim)} per claim`
                          : 'No limit',
                      ],
                      ...(claim.decisionNote ? [['Note', claim.decisionNote]] : []),
                      ...(claim.paidAt ? [['Paid on', formatDate(claim.paidAt)]] : []),
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {claim.canDecide && (
                  <div className="grid gap-2.5">
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button
                        onClick={() =>
                          setDialog({ kind: 'reject', type: 'expense', ids: [claim.id] })
                        }
                      >
                        <X /> Decline
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => decide('expense', [claim.id], 'APPROVE')}
                      >
                        <Check /> Approve
                      </Button>
                    </div>
                    {claim.status !== 'ON_HOLD' && (
                      <Button variant="ghost" onClick={() => decide('expense', [claim.id], 'HOLD')}>
                        <Pause /> Put on hold
                      </Button>
                    )}
                  </div>
                )}
                {claim.canMarkPaid && (
                  <Button className="w-full" onClick={() => decide('expense', [claim.id], 'PAID')}>
                    <IndianRupee /> Mark as paid
                  </Button>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Spend by category</CardTitle>
                  <CardDescription>This month</CardDescription>
                </div>
              </CardHeader>
              {summary?.spendByCategory.length ? (
                <ul className="grid gap-3.5">
                  {summary.spendByCategory.map((s) => (
                    <li key={s.label} className="grid gap-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{s.label}</span>
                        <span className="font-mono text-[13px] text-muted-foreground">
                          {inr(s.amount)}
                        </span>
                      </div>
                      <ProgressBar value={(s.amount / biggestSpend) * 100} label={s.label} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="py-8">No claims this month yet.</Empty>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'overtime' && (
          <OvertimeDialog
            manage={manage}
            selfId={summary?.selfEmployeeId ?? null}
            onDone={() => {
              setDialog(null);
              showToast('Overtime logged. Your manager has been asked to approve it.');
              setTab('overtime');
              void load();
            }}
          />
        )}
        {dialog?.kind === 'expense' && (
          <ExpenseDialog
            manage={manage}
            selfId={summary?.selfEmployeeId ?? null}
            onDone={() => {
              setDialog(null);
              showToast('Claim sent for approval');
              setTab('claims');
              void load();
            }}
          />
        )}
        {dialog?.kind === 'reject' && (
          <RejectDialog onReject={(note) => decide(dialog.type, dialog.ids, 'REJECT', note)} />
        )}
        {dialog?.kind === 'categories' && <CategoriesDialog onToast={showToast} />}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

/** HR can file for others; everyone else files for themselves. */
function usePeople(manage: boolean, selfId: string | null) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!manage) return;
    api<Paged<Employee>>('/employees?pageSize=100')
      .then((r) =>
        setPeople(
          r.items
            .filter((e) => e.status !== 'EXITED')
            .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
        ),
      )
      .catch(() => undefined);
  }, [manage]);
  return useMemo(
    () =>
      selfId ? [{ id: selfId, name: 'Myself' }, ...people.filter((p) => p.id !== selfId)] : people,
    [people, selfId],
  );
}

function OvertimeDialog({
  manage,
  selfId,
  onDone,
}: {
  manage: boolean;
  selfId: string | null;
  onDone: () => void;
}) {
  const people = usePeople(manage, selfId);
  const [employeeId, setEmployeeId] = useState(selfId ?? '');
  const [date, setDate] = useState(() =>
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  );
  const [hours, setHours] = useState('2');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employeeId && people[0]) setEmployeeId(people[0].id);
  }, [people, employeeId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/claims/overtime', {
        method: 'POST',
        body: JSON.stringify({
          ...(employeeId && employeeId !== selfId ? { employeeId } : {}),
          date,
          hours: Number(hours),
          reason,
        }),
      });
      onDone();
    } catch (err) {
      setError(errorText(err, 'Could not log overtime'));
      setBusy(false);
    }
  }

  return (
    <DialogContent title="Log overtime" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        {manage && people.length > 1 && (
          <Field id="ot-who" label="For">
            <Select id="ot-who" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ot-date" label="Date">
            <Input
              id="ot-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id="ot-hours" label="Extra hours">
            <Input
              id="ot-hours"
              type="number"
              min={0.5}
              max={16}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </Field>
        </div>
        <Field id="ot-reason" label="What was it for?">
          <Input
            id="ot-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Release night"
            required
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy || !employeeId}>
            {busy && <Loader2 className="animate-spin" />}
            Log overtime
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function ExpenseDialog({
  manage,
  selfId,
  onDone,
}: {
  manage: boolean;
  selfId: string | null;
  onDone: () => void;
}) {
  const people = usePeople(manage, selfId);
  const [categories, setCategories] = useState<ClaimCategory[]>([]);
  const [employeeId, setEmployeeId] = useState(selfId ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ClaimCategory[]>('/claims/categories')
      .then((cs) => {
        const active = cs.filter((c) => c.active);
        setCategories(active);
        setCategoryId(active[0]?.id ?? '');
      })
      .catch(() => setError('Could not load categories.'));
  }, []);
  useEffect(() => {
    if (!employeeId && people[0]) setEmployeeId(people[0].id);
  }, [people, employeeId]);

  const category = categories.find((c) => c.id === categoryId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (category?.needsReceipt && !file) return setError('Attach the receipt.');
    setBusy(true);
    setError('');
    try {
      let receiptDocumentId: string | null = null;
      if (file) {
        const doc = await uploadDocument(file, file.name, { employeeId }, 'Receipt');
        receiptDocumentId = doc.id;
      }
      await api('/claims/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...(employeeId && employeeId !== selfId ? { employeeId } : {}),
          categoryId,
          spentOn,
          amount: Math.round(Number(amount)),
          description,
          receiptDocumentId,
        }),
      });
      onDone();
    } catch (err) {
      setError(errorText(err, 'Could not send the claim'));
      setBusy(false);
    }
  }

  return (
    <DialogContent title="New expense claim" side="right" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        {manage && people.length > 1 && (
          <Field id="ex-who" label="For">
            <Select id="ex-who" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field id="ex-cat" label="Category">
          <Select id="ex-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.limitPerClaim ? ` · up to ${inr(c.limitPerClaim)}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ex-date" label="Spent on">
            <Input
              id="ex-date"
              type="date"
              value={spentOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </Field>
          <Field id="ex-amount" label="Amount (₹)">
            <Input
              id="ex-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field id="ex-desc" label="What for?">
          <Input
            id="ex-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cab to client office"
            required
          />
        </Field>
        <FileDrop
          title={file ? file.name : 'Add the receipt'}
          caption={
            category?.needsReceipt
              ? 'Needed for this category · PDF or photo'
              : 'Optional · PDF or photo'
          }
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onFile={setFile}
          className="py-6"
        />
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy || !categoryId || !employeeId}>
            {busy && <Loader2 className="animate-spin" />}
            Send claim
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function RejectDialog({ onReject }: { onReject: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <DialogContent title="Decline this?" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) onReject(note.trim());
        }}
      >
        <Field id="rj-note" label="Reason (shown to the employee)">
          <Input
            id="rj-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Receipt is unreadable, please upload again"
            required
          />
        </Field>
        <div className="flex gap-3">
          <Button variant="danger" type="submit">
            <X /> Decline
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function CategoriesDialog({ onToast }: { onToast: (m: string) => void }) {
  const [cats, setCats] = useState<ClaimCategory[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<ClaimCategory[]>('/claims/categories')
      .then(setCats)
      .catch(() => setError('Could not load categories.'));
  }, []);

  async function save(c: ClaimCategory, patch: Partial<ClaimCategory>) {
    try {
      const updated = await api<ClaimCategory>(`/claims/categories/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setCats((cs) => cs && cs.map((x) => (x.id === c.id ? updated : x)));
    } catch (err) {
      onToast(errorText(err, 'Could not save'));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      const c = await api<ClaimCategory>('/claims/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setCats((cs) => [...(cs ?? []), c]);
      setName('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'That category already exists.'
          : errorText(err, 'Could not add'),
      );
    }
  }

  return (
    <DialogContent title="Claim categories and limits" side="right" aria-describedby={undefined}>
      <div className="grid gap-4">
        {!cats ? (
          <Skeleton className="h-40" />
        ) : (
          cats.map((c) => (
            <div key={c.id} className="grid gap-3 rounded-2xl bg-surface-2/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">{c.name}</span>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  Limit ₹
                  <Input
                    type="number"
                    min={1}
                    defaultValue={c.limitPerClaim ?? ''}
                    placeholder="None"
                    className="h-9 w-28"
                    aria-label={`${c.name} limit per claim`}
                    onBlur={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      if (v !== c.limitPerClaim) void save(c, { limitPerClaim: v });
                    }}
                  />
                </label>
              </div>
              <ToggleRow
                title="Needs a receipt"
                checked={c.needsReceipt}
                onCheckedChange={(v) => save(c, { needsReceipt: v })}
              />
              <ToggleRow
                title="People can claim it"
                checked={c.active}
                onCheckedChange={(v) => save(c, { active: v })}
              />
            </div>
          ))
        )}
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category, e.g. Relocation"
            aria-label="New category name"
          />
          <Button type="submit" disabled={!name.trim()}>
            <Plus /> Add
          </Button>
        </form>
        <FormError>{error}</FormError>
      </div>
    </DialogContent>
  );
}
