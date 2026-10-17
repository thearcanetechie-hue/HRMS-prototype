'use client';

import { Check, CheckCircle2, Clock, FileImage, Receipt, Settings, Wallet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { DemoBadge, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getClaimsOverview,
  type ClaimsOverview,
  type ExpenseClaim,
  type OvertimeRequest,
  type Person,
} from '@/lib/demo/claims';
import { inr, inrShort, titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'approved' | 'paid' | 'rejected';
const STATUS_FILTERS: Status[] = ['pending', 'approved', 'paid', 'rejected'];
const TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  paid: 'info',
  rejected: 'danger',
  on_hold: 'danger',
};

function PersonCell({ person }: { person: Person }) {
  return (
    <div className="flex min-w-40 items-center gap-2.5">
      <Avatar size="sm" initials={person.initials} />
      <div>
        <div className="font-bold whitespace-nowrap">{person.name}</div>
        <div className="text-xs text-muted-foreground">{person.team}</div>
      </div>
    </div>
  );
}

export default function ClaimsPage() {
  const [data, setData] = useState<ClaimsOverview | null>(null);
  const [status, setStatus] = useState<Status>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [claimId, setClaimId] = useState('c1');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [toast, showToast] = useToast();

  useEffect(() => {
    getClaimsOverview().then((d) => {
      setData(d);
      setSelected(new Set(d.overtime.filter((o) => o.status === 'pending').map((o) => o.id)));
    });
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Money" title="Overtime & reimbursements" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const overtime = data.overtime.filter((o) => o.status === status);
  const claims = data.claims.filter((c) =>
    status === 'pending' ? c.status === 'pending' || c.status === 'on_hold' : c.status === status,
  );
  const claim = data.claims.find((c) => c.id === claimId);
  const pendingOvertimeHours = data.overtime.reduce((a, o) => a + o.hours, 0);
  const biggestSpend = Math.max(...data.spend.map((s) => s.amount));

  const setOvertime = (ids: string[], s: OvertimeRequest['status']) =>
    setData(
      (d) =>
        d && {
          ...d,
          overtime: d.overtime.map((o) => (ids.includes(o.id) ? { ...o, status: s } : o)),
        },
    );
  const setClaim = (id: string, s: ExpenseClaim['status']) =>
    setData(
      (d) => d && { ...d, claims: d.claims.map((c) => (c.id === id ? { ...c, status: s } : c)) },
    );

  function approveSelected() {
    const ids = [...selected];
    setOvertime(ids, 'approved');
    setSelected(new Set());
    showToast(`Approved ${ids.length} overtime ${ids.length === 1 ? 'request' : 'requests'}`);
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
        title={
          <span className="flex flex-wrap items-center gap-3">
            Overtime & reimbursements <DemoBadge />
          </span>
        }
        description="Extra hours and expense claims flow into October payroll once approved."
        actions={
          <>
            <Button disabled title="Coming soon">
              <Settings /> Policies
            </Button>
            <Button variant="primary" disabled={!selected.size} onClick={approveSelected}>
              <Check /> Approve selected{selected.size ? ` (${selected.size})` : ''}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs defaultValue="overtime">
          <TabsList>
            <TabsTrigger value="overtime">Overtime</TabsTrigger>
            <TabsTrigger value="claims">Expense claims</TabsTrigger>
            <TabsTrigger value="advances" disabled title="Coming soon">
              Advances
            </TabsTrigger>
            <TabsTrigger value="policies" disabled title="Coming soon">
              Policies
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {titleCase(s)}
              {s === 'pending' && (
                <span className="font-mono text-xs opacity-80">
                  {data.overtime.filter((o) => o.status === 'pending').length +
                    data.claims.filter((c) => c.status === 'pending').length}
                </span>
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
            value={`${186} h`}
            label="Overtime this month"
            delta="+12%"
            deltaTone="warning"
          />
          <StatCard
            icon={<Wallet />}
            value={inrShort(142000)}
            label="Overtime payout"
            delta="At 2× rate"
          />
          <StatCard
            icon={<Receipt />}
            tone="warning"
            value={inrShort(data.pendingClaimsAmount)}
            label="Claims pending"
            delta={`${data.pendingClaimsCount} claims`}
            deltaTone="warning"
          />
          <StatCard
            icon={<CheckCircle2 />}
            tone="success"
            value="1.6 days"
            label="Avg approval time"
            delta="-0.4 d"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Overtime requests</CardTitle>
                  <CardDescription>
                    Paid at 2× hourly basic as per Factories Act / company policy ·{' '}
                    {pendingOvertimeHours} h listed
                  </CardDescription>
                </div>
              </CardHeader>
              {overtime.length ? (
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
                      <TH className="text-right">Amount</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {overtime.map((o) => (
                      <TR key={o.id}>
                        <TD className="pr-0">
                          {o.status === 'pending' && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${o.employee.name}, ${o.date}`}
                              className="size-4 cursor-pointer accent-primary"
                              checked={selected.has(o.id)}
                              onChange={() => toggle(o.id)}
                            />
                          )}
                        </TD>
                        <TD>
                          <PersonCell person={o.employee} />
                        </TD>
                        <TD className="whitespace-nowrap">{o.date}</TD>
                        <TD className="text-right font-mono text-[13px]">{o.hours.toFixed(1)}</TD>
                        <TD className="min-w-40">{o.reason}</TD>
                        <TD className="text-right font-mono text-[13px] whitespace-nowrap">
                          {inr(o.amount)}
                        </TD>
                        <TD>
                          <Badge tone={TONE[o.status]}>{titleCase(o.status)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <Empty className="py-10">No {status} overtime</Empty>
              )}
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>Expense claims</CardTitle>
                  <CardDescription>
                    {data.pendingClaimsCount} claims · {inrShort(data.pendingClaimsAmount)} waiting
                  </CardDescription>
                </div>
              </CardHeader>
              {claims.length ? (
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
                    {claims.map((c) => (
                      <TR
                        key={c.id}
                        aria-selected={c.id === claimId}
                        className={cn(
                          'cursor-pointer',
                          c.id === claimId && 'bg-primary/6 even:bg-primary/6',
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
                        <TD className="whitespace-nowrap">{c.category}</TD>
                        <TD className="whitespace-nowrap">{c.spentOn}</TD>
                        <TD>
                          <Badge tone={c.receipt === 'attached' ? 'success' : 'danger'}>
                            {titleCase(c.receipt)}
                          </Badge>
                        </TD>
                        <TD className="text-right font-mono text-[13px] whitespace-nowrap">
                          {inr(c.amount)}
                        </TD>
                        <TD>
                          <Badge tone={TONE[c.status]}>{titleCase(c.status)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <Empty className="py-10">No {status} claims</Empty>
              )}
            </Card>
          </div>

          <div className="grid content-start gap-5">
            {claim && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Claim detail</CardTitle>
                    <CardDescription>
                      {claim.employee.name} · {claim.category}
                    </CardDescription>
                  </div>
                  <Badge tone={TONE[claim.status]}>{titleCase(claim.status)}</Badge>
                </CardHeader>
                <div className="mb-4 flex items-center gap-3 rounded-[14px] bg-surface-2 p-3 shadow-inset-sm">
                  <IconTile tone={claim.receiptFile ? 'detail' : 'danger'} size={44}>
                    <FileImage />
                  </IconTile>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {claim.receiptFile ?? 'No receipt uploaded'}
                    </div>
                    <div
                      className={cn('text-xs', claim.receiptFile ? 'text-success' : 'text-danger')}
                    >
                      {claim.receiptNote ?? 'Ask for the receipt before approving'}
                    </div>
                  </div>
                </div>
                <dl className="mb-5 grid gap-2.5">
                  {claim.details?.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {(claim.status === 'pending' || claim.status === 'on_hold') && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={() => setRejecting(true)}>
                      <X /> Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setClaim(claim.id, 'approved');
                        showToast(`Approved ${claim.employee.name}’s claim`);
                      }}
                    >
                      <Check /> Approve
                    </Button>
                  </div>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Spend by category</CardTitle>
                  <CardDescription>October so far</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3.5">
                {data.spend.map((s) => (
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
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent title="Reject this claim?" aria-describedby={undefined}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!claim || !reason.trim()) return;
              setClaim(claim.id, 'rejected');
              setRejecting(false);
              setReason('');
              showToast(`Rejected ${claim.employee.name}’s claim`);
            }}
          >
            <Field id="reject-reason" label="Reason (shown to the employee)">
              <Input
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Receipt is unreadable, please upload again"
                required
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="danger" type="submit">
                <X /> Reject claim
              </Button>
              <DialogClose asChild>
                <Button type="button">Cancel</Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Toast message={toast} />
    </>
  );
}
