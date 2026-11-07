'use client';

import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Loader2,
  Pencil,
  Play,
  Plug,
  Plus,
  Star,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import {
  api,
  ApiError,
  type Employee,
  type GoalItem,
  type KudosData,
  type Paged,
  type PerformanceOverview,
  type PerfPerson,
  type ReviewItem,
  type ReviewsData,
} from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const GOAL_STATUS: Record<GoalItem['status'], [string, BadgeTone, Tone]> = {
  ON_TRACK: ['On track', 'success', 'success'],
  AT_RISK: ['At risk', 'warning', 'warning'],
  BEHIND: ['Behind', 'danger', 'danger'],
  DONE: ['Done', 'info', 'info'],
};
const STAGE: Record<ReviewItem['stage'], [string, BadgeTone]> = {
  SELF: ['Self review', 'warning'],
  MANAGER: ['Manager review', 'accent'],
  CALIBRATION: ['Calibration', 'info'],
  SHARED: ['Shared', 'success'],
};
const RATINGS = [
  '',
  'Needs improvement',
  'Developing',
  'Meets expectations',
  'Exceeds expectations',
  'Outstanding',
];
const nameOf = (p: PerfPerson) => `${p.firstName} ${p.lastName}`.trim();
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

type Dialogs =
  | { kind: 'goal'; goal: GoalItem | null }
  | { kind: 'cycle' }
  | { kind: 'kudos' }
  | { kind: 'review'; review: ReviewItem; as: 'self' | 'manager' | 'share' }
  | null;

export default function PerformancePage() {
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [goals, setGoals] = useState<GoalItem[] | null>(null);
  const [reviews, setReviews] = useState<ReviewsData | null>(null);
  const [kudos, setKudos] = useState<KudosData | null>(null);
  const [tab, setTab] = useState('overview');
  const [scope, setScope] = useState<'' | GoalItem['scope']>('');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      const [o, g, r, k] = await Promise.all([
        api<PerformanceOverview>('/performance/overview'),
        api<GoalItem[]>('/performance/goals'),
        api<ReviewsData>('/performance/reviews'),
        api<KudosData>('/performance/kudos'),
      ]);
      setOverview(o);
      setGoals(g);
      setReviews(r);
      setKudos(k);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load performance.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const done = (message: string) => {
    setDialog(null);
    showToast(message);
    void load();
  };

  const manage = overview?.canManage ?? false;
  const counts = reviews?.counts;
  const pct = counts?.total ? Math.round((counts.managerDone / counts.total) * 100) : 0;
  const shownGoals = (goals ?? []).filter((g) => !scope || g.scope === scope);
  const todo = (reviews?.reviews ?? []).filter(
    (r) => r.canWriteSelf || r.canWriteManager || r.canShare,
  );

  const goalsTable = (rows: GoalItem[]) =>
    rows.length ? (
      <Table bare>
        <THead>
          <tr>
            <TH>Goal</TH>
            <TH>Owner</TH>
            <TH>Due</TH>
            <TH>Progress</TH>
            <TH>Status</TH>
            <TH>
              <span className="sr-only">Edit</span>
            </TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((g) => {
            const [label, badge, tone] = GOAL_STATUS[g.status];
            return (
              <TR key={g.id}>
                <TD className="min-w-52">
                  <div className="font-semibold">{g.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.scope === 'COMPANY'
                      ? 'Company goal'
                      : g.scope === 'TEAM'
                        ? 'Team goal'
                        : 'Personal'}
                  </div>
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar
                      initials={initials(g.owner.firstName, g.owner.lastName)}
                      className="size-[30px] text-[11px]"
                    />
                    <span className="whitespace-nowrap">{nameOf(g.owner)}</span>
                  </div>
                </TD>
                <TD className="whitespace-nowrap">{formatDate(g.dueDate)}</TD>
                <TD>
                  <div className="flex min-w-36 items-center gap-2.5">
                    <ProgressBar value={g.progress} tone={tone} className="w-24" />
                    <span className="font-mono text-[13px]">{g.progress}%</span>
                  </div>
                </TD>
                <TD>
                  <Badge tone={badge}>{label}</Badge>
                </TD>
                <TD>
                  {g.canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Update ${g.title}`}
                      onClick={() => setDialog({ kind: 'goal', goal: g })}
                    >
                      <Pencil />
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    ) : (
      <Empty className="py-10">No goals yet. Add the first one with “New goal”.</Empty>
    );

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Performance"
        description="Goals, review cycles and recognition across the company."
        actions={
          <>
            <Button onClick={() => setDialog({ kind: 'kudos' })}>
              <Award /> Give kudos
            </Button>
            <Button onClick={() => setDialog({ kind: 'goal', goal: null })}>
              <Target /> New goal
            </Button>
            {manage && (
              <Button
                variant="primary"
                disabled={Boolean(reviews?.cycle)}
                title={reviews?.cycle ? 'A review cycle is already running' : undefined}
                onClick={() => setDialog({ kind: 'cycle' })}
              >
                <Play /> Start review cycle
              </Button>
            )}
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews{todo.length ? ` · ${todo.length} to do` : ''}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<Target />}
            value={overview?.goalsOnTrackPct != null ? `${overview.goalsOnTrackPct}%` : '–'}
            label="Goals on track"
            delta={overview ? `${overview.goals} goals` : undefined}
            deltaTone="info"
          />
          <StatCard
            icon={<CheckCircle2 />}
            tone="warning"
            value={counts ? `${counts.managerDone} / ${counts.total}` : '–'}
            label={reviews?.cycle ? `${reviews.cycle.name} reviews done` : 'Reviews done'}
            delta={counts ? `${pct}%` : 'No cycle running'}
            deltaTone="warning"
          />
          <StatCard
            icon={<AlertTriangle />}
            tone="danger"
            value={overview?.goalsAtRisk ?? '–'}
            label="Goals at risk or behind"
          />
          <StatCard
            icon={<TrendingUp />}
            tone="success"
            value={overview?.kudosThisMonth ?? '–'}
            label="Kudos in the last 30 days"
          />
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
              <Card className="min-w-0">
                <CardHeader>
                  <div>
                    <CardTitle>Workload by person</CardTitle>
                    <CardDescription>
                      Planned hours as a share of capacity, from your work tracker
                    </CardDescription>
                  </div>
                </CardHeader>
                <div className="grid justify-items-center gap-3 py-8 text-center">
                  <IconTile tone="info" size={44}>
                    <Plug />
                  </IconTile>
                  <p className="max-w-md text-muted-foreground">
                    Workload comes from the tasks people are assigned in Jira. Connect Jira in
                    Integrations to see who is stretched over the next six weeks.
                  </p>
                  <Button size="sm" asChild>
                    <Link href="/integrations">Open Integrations</Link>
                  </Button>
                </div>
              </Card>

              <Card>
                {reviews?.cycle && counts ? (
                  <>
                    <CardHeader>
                      <div>
                        <CardTitle>{reviews.cycle.name}</CardTitle>
                        <CardDescription>
                          Closes {formatDate(reviews.cycle.closesOn)}
                        </CardDescription>
                      </div>
                      <Badge tone="accent">Live</Badge>
                    </CardHeader>
                    <div className="mb-5 flex justify-center">
                      <ProgressRing value={pct} label="Review cycle" caption="managers done" />
                    </div>
                    <dl className="mb-5 grid gap-2.5">
                      {(
                        [
                          ['Self reviews', counts.selfDone],
                          ['Manager reviews', counts.managerDone],
                          ['Shared with employees', counts.shared],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="font-semibold">{k}</dt>
                          <dd className="font-mono text-[13px] text-muted-foreground">
                            {v} / {counts.total}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {manage && (
                      <Button
                        className="w-full"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Close ${reviews.cycle!.name}? Unfinished reviews stay as they are.`,
                            )
                          )
                            return;
                          try {
                            await api(`/performance/cycles/${reviews.cycle!.id}/close`, {
                              method: 'POST',
                            });
                            done('Review cycle closed');
                          } catch (err) {
                            showToast(errorText(err, 'Could not close'));
                          }
                        }}
                      >
                        Close cycle
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="grid justify-items-center gap-3 py-8 text-center">
                    <Empty className="py-0">No review cycle running</Empty>
                    {manage && (
                      <Button size="sm" onClick={() => setDialog({ kind: 'cycle' })}>
                        <Play /> Start review cycle
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
              <Card className="min-w-0">
                <CardHeader>
                  <div>
                    <CardTitle>Company goals</CardTitle>
                    <CardDescription>
                      {(goals ?? []).filter((g) => g.scope === 'COMPANY').length} company goals
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setTab('goals')}>
                    All goals
                  </Button>
                </CardHeader>
                {!goals ? (
                  <Skeleton className="h-40" />
                ) : (
                  goalsTable(goals.filter((g) => g.scope === 'COMPANY'))
                )}
              </Card>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Recognition</CardTitle>
                    <CardDescription>Most thanked in the last 30 days</CardDescription>
                  </div>
                </CardHeader>
                {kudos?.top.length ? (
                  <ul className="grid gap-4">
                    {kudos.top.map((t) => (
                      <li key={t.employee.id} className="flex items-center gap-3">
                        <Avatar
                          size="sm"
                          initials={initials(t.employee.firstName, t.employee.lastName)}
                        />
                        <div className="min-w-0 grow">
                          <div className="font-bold">{nameOf(t.employee)}</div>
                          <div className="truncate text-[13px] text-muted-foreground">
                            {t.latest}
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/14 px-2.5 py-1 text-xs font-bold text-warning">
                          <Star className="size-3.5 fill-current" /> {t.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="grid justify-items-center gap-3 py-6">
                    <Empty className="py-0">No kudos yet this month.</Empty>
                    <Button size="sm" onClick={() => setDialog({ kind: 'kudos' })}>
                      <Award /> Thank someone
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {tab === 'goals' && (
          <Card className="min-w-0">
            <CardHeader>
              <div>
                <CardTitle>Goals</CardTitle>
                <CardDescription>Yours, your team’s and the company’s</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['', 'COMPANY', 'TEAM', 'PERSONAL'] as const).map((s) => (
                  <Chip key={s || 'all'} active={scope === s} onClick={() => setScope(s)}>
                    {s ? s[0] + s.slice(1).toLowerCase() : 'All'}
                  </Chip>
                ))}
              </div>
            </CardHeader>
            {!goals ? <Skeleton className="h-40" /> : goalsTable(shownGoals)}
          </Card>
        )}

        {tab === 'reviews' && (
          <Card className="min-w-0">
            <CardHeader>
              <div>
                <CardTitle>{reviews?.cycle ? reviews.cycle.name : 'Reviews'}</CardTitle>
                <CardDescription>
                  {reviews?.cycle
                    ? `Closes ${formatDate(reviews.cycle.closesOn)}`
                    : 'No review cycle running'}
                </CardDescription>
              </div>
            </CardHeader>
            {!reviews ? (
              <Skeleton className="h-40" />
            ) : reviews.reviews.length ? (
              <ul className="grid gap-2.5">
                {reviews.reviews.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 rounded-[14px] bg-surface-2/60 p-3.5"
                  >
                    <Avatar
                      size="sm"
                      initials={initials(r.employee.firstName, r.employee.lastName)}
                    />
                    <div className="min-w-0 grow basis-48">
                      <div className="font-bold">{nameOf(r.employee)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.reviewer ? `Reviewer: ${nameOf(r.reviewer)}` : 'Reviewer: HR'}
                        {r.finalRating ? ` · Final: ${RATINGS[r.finalRating]}` : ''}
                      </div>
                    </div>
                    <Badge tone={STAGE[r.stage][1]}>{STAGE[r.stage][0]}</Badge>
                    {r.canWriteSelf && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setDialog({ kind: 'review', review: r, as: 'self' })}
                      >
                        {r.selfRating ? 'Edit self review' : 'Write self review'}
                      </Button>
                    )}
                    {r.canWriteManager && (
                      <Button
                        size="sm"
                        onClick={() => setDialog({ kind: 'review', review: r, as: 'manager' })}
                      >
                        {r.managerRating ? 'Edit review' : 'Write review'}
                      </Button>
                    )}
                    {r.canShare && (
                      <Button
                        size="sm"
                        onClick={() => setDialog({ kind: 'review', review: r, as: 'share' })}
                      >
                        Calibrate & share
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="py-10">
                {reviews.cycle
                  ? 'No reviews for you in this cycle.'
                  : 'Start a review cycle to begin.'}
              </Empty>
            )}
          </Card>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'goal' && (
          <GoalDialog
            goal={dialog.goal}
            manage={manage}
            selfId={overview?.selfEmployeeId ?? null}
            onDone={done}
          />
        )}
        {dialog?.kind === 'cycle' && <CycleDialog onDone={done} />}
        {dialog?.kind === 'kudos' && (
          <KudosDialog selfId={overview?.selfEmployeeId ?? null} onDone={done} />
        )}
        {dialog?.kind === 'review' && (
          <ReviewDialog review={dialog.review} as={dialog.as} onDone={done} />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function usePeople() {
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
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
  return people;
}

function GoalDialog({
  goal,
  manage,
  selfId,
  onDone,
}: {
  goal: GoalItem | null;
  manage: boolean;
  selfId: string | null;
  onDone: (m: string) => void;
}) {
  const people = usePeople();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [ownerId, setOwnerId] = useState(goal?.ownerId ?? selfId ?? '');
  const [scope, setScope] = useState<GoalItem['scope']>(goal?.scope ?? 'PERSONAL');
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? `${new Date().getFullYear()}-12-31`);
  const [progress, setProgress] = useState(String(goal?.progress ?? 0));
  const [status, setStatus] = useState<GoalItem['status']>(goal?.status ?? 'ON_TRACK');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({
        title,
        ownerId: ownerId || undefined,
        scope,
        dueDate,
        progress: Number(progress),
        status,
      });
      if (goal) await api(`/performance/goals/${goal.id}`, { method: 'PATCH', body });
      else await api('/performance/goals', { method: 'POST', body });
      onDone(goal ? 'Goal updated' : 'Goal added');
    } catch (err) {
      setError(errorText(err, 'Could not save the goal'));
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={goal ? 'Update goal' : 'New goal'}
      side="right"
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field id="g-title" label="Goal">
          <Input
            id="g-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cut support backlog to under 50"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="g-owner" label="Owner">
            <Select id="g-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === selfId ? 'Me' : p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="g-scope" label="Kind">
            <Select
              id="g-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as GoalItem['scope'])}
            >
              <option value="PERSONAL">Personal</option>
              <option value="TEAM">Team</option>
              {manage && <option value="COMPANY">Company</option>}
            </Select>
          </Field>
          <Field id="g-due" label="Due">
            <Input
              id="g-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field id="g-progress" label="Progress (%)">
            <Input
              id="g-progress"
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </Field>
          <Field id="g-status" label="Status">
            <Select
              id="g-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as GoalItem['status'])}
            >
              {Object.entries(GOAL_STATUS).map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <FormError>{error}</FormError>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Save
          </Button>
          {goal && (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (!window.confirm('Delete this goal?')) return;
                try {
                  await api(`/performance/goals/${goal.id}`, { method: 'DELETE' });
                  onDone('Goal deleted');
                } catch (err) {
                  setError(errorText(err, 'Could not delete'));
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function CycleDialog({ onDone }: { onDone: (m: string) => void }) {
  const y = new Date().getFullYear();
  const half = new Date().getMonth() < 6 ? 'H1' : 'H2';
  const [name, setName] = useState(`${half} ${y} review`);
  const [closesOn, setClosesOn] = useState(() =>
    new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [error, setError] = useState('');
  return (
    <DialogContent title="Start a review cycle" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/performance/cycles', {
              method: 'POST',
              body: JSON.stringify({ name, closesOn }),
            });
            onDone(`${name} started. Everyone now has a self review to write.`);
          } catch (err) {
            setError(errorText(err, 'Could not start the cycle'));
          }
        }}
      >
        <Field id="c-name" label="Name">
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field id="c-close" label="Closes on">
          <Input
            id="c-close"
            type="date"
            value={closesOn}
            onChange={(e) => setClosesOn(e.target.value)}
          />
        </Field>
        <p className="text-[13px] text-muted-foreground">
          Every current employee gets a review. Their manager today writes the manager review; HR
          covers people without a manager.
        </p>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            <Play /> Start
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

const VALUES = [
  'Ownership',
  'Teamwork',
  'Customer first',
  'Quality',
  'Helping others',
  'Going the extra mile',
];

function KudosDialog({ selfId, onDone }: { selfId: string | null; onDone: (m: string) => void }) {
  const people = usePeople().filter((p) => p.id !== selfId);
  const [toId, setToId] = useState('');
  const [value, setValue] = useState(VALUES[0]!);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title="Give kudos" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/performance/kudos', {
              method: 'POST',
              body: JSON.stringify({ toId: toId || people[0]?.id, value, reason }),
            });
            onDone('Kudos sent');
          } catch (err) {
            setError(errorText(err, 'Could not send kudos'));
          }
        }}
      >
        <Field id="k-to" label="To">
          <Select
            id="k-to"
            value={toId || people[0]?.id || ''}
            onChange={(e) => setToId(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {VALUES.map((v) => (
            <Chip key={v} active={value === v} onClick={() => setValue(v)}>
              {v}
            </Chip>
          ))}
        </div>
        <Field id="k-why" label="What for?">
          <Input
            id="k-why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Owned the release end to end"
            required
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!people.length}>
            <Award /> Send kudos
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="grid gap-2 sm:grid-cols-5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cn(
            'grid cursor-pointer gap-1 rounded-xl p-2.5 text-center text-xs font-semibold',
            value === n
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-surface-2/70 text-muted-foreground',
          )}
        >
          <span className="text-lg font-extrabold">{n}</span>
          {RATINGS[n]}
        </button>
      ))}
    </div>
  );
}

function ReviewDialog({
  review: r,
  as,
  onDone,
}: {
  review: ReviewItem;
  as: 'self' | 'manager' | 'share';
  onDone: (m: string) => void;
}) {
  const [rating, setRating] = useState(
    (as === 'self'
      ? r.selfRating
      : as === 'manager'
        ? r.managerRating
        : (r.finalRating ?? r.managerRating)) ?? 3,
  );
  const [comments, setComments] = useState(
    (as === 'self' ? r.selfComments : r.managerComments) ?? '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (as === 'share')
        await api(`/performance/reviews/${r.id}/share`, {
          method: 'POST',
          body: JSON.stringify({ finalRating: rating }),
        });
      else
        await api(`/performance/reviews/${r.id}/${as}`, {
          method: 'POST',
          body: JSON.stringify({ rating, comments }),
        });
      onDone(as === 'share' ? `Shared with ${nameOf(r.employee)}` : 'Review saved');
    } catch (err) {
      setError(errorText(err, 'Could not save'));
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={
        as === 'self'
          ? 'Your self review'
          : as === 'manager'
            ? `Review for ${nameOf(r.employee)}`
            : `Calibrate ${nameOf(r.employee)}`
      }
      side="right"
      className="max-w-2xl"
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-5">
        {as !== 'self' && r.selfRating && (
          <div className="rounded-2xl bg-surface-2/60 p-4 text-[13.5px]">
            <div className="mb-1 font-bold">Their self review · {RATINGS[r.selfRating]}</div>
            <p className="whitespace-pre-wrap text-muted-foreground">{r.selfComments}</p>
          </div>
        )}
        {as === 'share' && r.managerRating && (
          <div className="rounded-2xl bg-surface-2/60 p-4 text-[13.5px]">
            <div className="mb-1 font-bold">Manager review · {RATINGS[r.managerRating]}</div>
            <p className="whitespace-pre-wrap text-muted-foreground">{r.managerComments}</p>
          </div>
        )}
        <div className="grid gap-2">
          <span className="text-[13px] font-semibold text-muted-foreground">
            {as === 'share' ? 'Final rating' : 'Rating'}
          </span>
          <RatingPicker value={rating} onChange={setRating} />
        </div>
        {as !== 'share' && (
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">
              {as === 'self'
                ? 'What went well, and what you want to grow in'
                : 'Strengths, areas to grow, and examples'}
            </span>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={8}
              required
              className="w-full rounded-xl bg-surface-2 p-3.5 text-sm shadow-inset-sm outline-none focus-visible:outline-2 focus-visible:outline-ring/60"
            />
          </label>
        )}
        {as === 'share' && (
          <p className="text-[13px] text-muted-foreground">
            Sharing shows the manager’s review and the final rating to {r.employee.firstName}.
          </p>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {as === 'share' ? 'Share review' : 'Save review'}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
