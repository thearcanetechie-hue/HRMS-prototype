'use client';

import {
  BookOpen,
  CalendarPlus,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LegendDot, Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton, StackedBar } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  api,
  ApiError,
  type CourseItem,
  type CourseMode,
  type Employee,
  type LearnerItem,
  type LearningOverview,
  type Named,
  type Paged,
} from '@/lib/api';
import { initials, num, titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<CourseItem['status'], BadgeTone> = {
  ONGOING: 'accent',
  UPCOMING: 'warning',
  COMPLETED: 'success',
};
const ICON: Record<string, LucideIcon> = {
  Compliance: ShieldCheck,
  Engineering: GraduationCap,
  Sales: TrendingUp,
  Leadership: Users,
  Finance: BookOpen,
};
const CATEGORIES = [
  'Compliance',
  'Engineering',
  'Sales',
  'Leadership',
  'Finance',
  'Product',
  'Wellbeing',
];
const MODES: Record<CourseMode, string> = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  IN_PERSON: 'In person',
  SELF_PACED: 'Self-paced',
};
const FILTERS = ['all', 'mine', 'ongoing', 'upcoming', 'completed', 'mandatory'] as const;

const iconFor = (c: CourseItem) => ICON[c.category] ?? GraduationCap;
const short = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const schedule = (c: CourseItem) => `${short(c.startsOn)} – ${short(c.endsOn)}`;
const nameOf = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

type Dialogs =
  | { kind: 'course'; course: CourseItem | null }
  | { kind: 'session'; course: CourseItem }
  | { kind: 'assign'; course: CourseItem }
  | null;

export default function LearningPage() {
  const [data, setData] = useState<LearningOverview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [team, setTeam] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      setData(await api<LearningOverview>('/learning/overview'));
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load courses.'));
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

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Growth" title="Learning & development" />
        {error ? <Banner>{error}</Banner> : <Skeleton className="h-96 rounded-2xl" />}
      </>
    );

  const teams = [
    ...new Map(
      data.courses.filter((c) => c.department).map((c) => [c.department!.id, c.department!.name]),
    ),
  ];
  const courses = data.courses.filter(
    (c) =>
      (filter === 'all' ||
        (filter === 'mandatory'
          ? c.mandatory
          : filter === 'mine'
            ? c.mine
            : c.status === filter.toUpperCase())) &&
      (team === 'all' || (team === 'company' ? !c.department : c.department?.id === team)),
  );
  const selected = data.courses.find((c) => c.id === selectedId) ?? courses[0] ?? null;
  const s = data.stats;

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Learning & development"
        description="Courses run by your company, who has signed up and how far along they are."
        actions={
          data.canManage && (
            <Button variant="primary" onClick={() => setDialog({ kind: 'course', course: null })}>
              <Plus /> Create course
            </Button>
          )
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<GraduationCap />}
            value={s.running}
            label="Running courses"
            delta={`${s.mandatory} mandatory`}
          />
          <StatCard
            icon={<Users />}
            tone="info"
            value={num(s.registrations)}
            label="Registrations"
            delta={`+${s.registrationsThisMonth} in 30 days`}
          />
          <StatCard
            icon={<TrendingUp />}
            tone="success"
            value={s.completionPct != null ? `${s.completionPct}%` : '–'}
            label="Completion"
          />
          <StatCard
            icon={<Clock />}
            tone="detail"
            value={`${num(s.hours)} h`}
            label="Learning hours"
            delta="All time"
            deltaTone="info"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f === 'all' ? 'All courses' : f === 'mine' ? 'My courses' : titleCase(f)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {teams.length > 0 && (
            <div className="flex flex-wrap gap-2 xl:ml-auto">
              <Chip active={team === 'all'} onClick={() => setTeam('all')}>
                All teams
              </Chip>
              <Chip active={team === 'company'} onClick={() => setTeam('company')}>
                Company-wide
              </Chip>
              {teams.map(([id, name]) => (
                <Chip key={id} active={team === id} onClick={() => setTeam(id)}>
                  {name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <Card className="min-w-0 content-start">
            <CardHeader>
              <div>
                <CardTitle>Courses</CardTitle>
                <CardDescription>Newest first</CardDescription>
              </div>
            </CardHeader>
            {courses.length ? (
              <ul className="grid gap-2">
                {courses.map((c, i) => {
                  const Icon = iconFor(c);
                  const on = c.id === selected?.id;
                  const pct = (n: number) => (c.registered ? (n / c.registered) * 100 : 0);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          'grid w-full cursor-pointer items-center gap-4 rounded-2xl p-3.5 text-left transition-all md:grid-cols-[minmax(0,1fr)_120px_110px_170px]',
                          on
                            ? 'bg-surface shadow-raised'
                            : i % 2
                              ? 'bg-surface-2/50 hover:bg-surface-2'
                              : 'hover:bg-surface-2/60',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <IconTile size={44}>
                            <Icon />
                          </IconTile>
                          <div className="min-w-0">
                            <div className="font-bold">{c.title}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {c.mandatory ? 'Mandatory · ' : ''}
                              {c.category}
                              {c.lead ? ` · Led by ${nameOf(c.lead)}` : ''}
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge>
                              {c.mine && <Badge tone="info">You · {c.mine.progress}%</Badge>}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Schedule</div>
                          <div className="font-semibold whitespace-nowrap">{schedule(c)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Registered</div>
                          <div className="whitespace-nowrap">
                            <span className="text-xl font-extrabold tabular">{c.registered}</span>
                            {c.seats != null && (
                              <span className="text-[13px] text-muted-foreground">
                                {' '}
                                / {c.seats}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            Avg progress
                            <span className="font-mono font-bold text-foreground">{c.avg}%</span>
                          </div>
                          <StackedBar
                            segments={[
                              { label: 'Done', value: pct(c.done), tone: 'success' },
                              { label: 'In progress', value: pct(c.inProgress), tone: 'primary' },
                            ]}
                          />
                          <div className="text-[11.5px] text-muted-foreground">
                            {c.done} done · {c.inProgress} going · {c.notStarted} not started
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>
                {data.courses.length
                  ? 'No courses match these filters'
                  : data.canManage
                    ? 'No courses yet. Create the first one.'
                    : 'No courses open to you yet.'}
              </Empty>
            )}
          </Card>

          <div className="grid content-start gap-5">
            {selected && (
              <CourseCard
                key={selected.id}
                course={selected}
                canDelete={data.canManage}
                onChanged={(m) => {
                  showToast(m);
                  void load();
                }}
                onDialog={setDialog}
              />
            )}

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Next sessions</CardTitle>
                  <CardDescription>The coming week</CardDescription>
                </div>
              </CardHeader>
              {data.sessions.length ? (
                <ul className="grid gap-3.5">
                  {data.sessions.map((x) => {
                    const at = new Date(x.startsAt);
                    return (
                      <li key={x.id} className="flex items-center gap-3">
                        <div className="grid size-12 shrink-0 place-items-center content-center rounded-[14px] bg-primary/8 leading-tight text-primary">
                          <span className="text-[11px] font-bold uppercase">
                            {at.toLocaleDateString('en-IN', { weekday: 'short' })}
                          </span>
                          <span className="text-lg font-extrabold tabular">{at.getDate()}</span>
                        </div>
                        <div className="min-w-0 grow">
                          <div className="truncate font-semibold">{x.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {at.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}{' '}
                            · {x.location || MODES[x.mode]} · {x.course}
                          </div>
                        </div>
                        {x.meetingLink && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            asChild
                            aria-label={`Join ${x.title}`}
                          >
                            <a href={x.meetingLink} target="_blank" rel="noreferrer">
                              <ExternalLink />
                            </a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground">No sessions scheduled this week.</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'course' && (
          <CourseDialog course={dialog.course} hr={data.canManage} onDone={done} />
        )}
        {dialog?.kind === 'session' && <SessionDialog course={dialog.course} onDone={done} />}
        {dialog?.kind === 'assign' && <AssignDialog course={dialog.course} onDone={done} />}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function CourseCard({
  course: c,
  canDelete,
  onChanged,
  onDialog,
}: {
  course: CourseItem;
  canDelete: boolean;
  onChanged: (message: string) => void;
  onDialog: (d: Dialogs) => void;
}) {
  const [learners, setLearners] = useState<LearnerItem[] | null>(null);
  const [progress, setProgress] = useState(c.mine?.progress ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<LearnerItem[]>(`/learning/courses/${c.id}/learners`)
      .then(setLearners)
      .catch(() => setLearners(null));
  }, [c.id, c.registered, c.avg]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      onChanged(message);
    } catch (err) {
      onChanged(errorText(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{c.title}</CardTitle>
          <CardDescription>
            {c.mandatory ? 'Mandatory' : c.lead ? `Led by ${nameOf(c.lead)}` : c.category} ·{' '}
            {schedule(c)} · {c.hours} h
          </CardDescription>
        </div>
        {c.canManage && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit course"
            onClick={() => onDialog({ kind: 'course', course: c })}
          >
            <Pencil />
          </Button>
        )}
      </CardHeader>
      {c.description && <p className="mb-4 text-[13.5px] text-muted-foreground">{c.description}</p>}
      <div className="mb-5 flex flex-wrap items-center gap-5">
        <ProgressRing
          size={116}
          value={c.registered ? (c.done / c.registered) * 100 : 0}
          label="Course completion"
          caption="done"
        />
        <div className="grid gap-2">
          <LegendDot className="bg-success" label="Completed" value={c.done} />
          <LegendDot className="bg-primary" label="In progress" value={c.inProgress} />
          <LegendDot className="bg-muted-foreground/30" label="Not started" value={c.notStarted} />
        </div>
      </div>

      {c.mine && (
        <div className="mb-5 grid gap-2.5 rounded-2xl bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2 font-semibold">
            Your progress <span className="font-mono text-[13px]">{progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            aria-label="Your progress"
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy || progress === c.mine.progress}
              onClick={() =>
                act(
                  () =>
                    api(`/learning/enrolments/${c.mine!.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ progress }),
                    }),
                  progress >= 100 ? `Completed ${c.title}` : 'Progress saved',
                )
              }
            >
              Save progress
            </Button>
            {!c.mandatory && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Leave ${c.title}?`)) return;
                  void act(
                    () => api(`/learning/courses/${c.id}/enrol`, { method: 'DELETE' }),
                    `You left ${c.title}`,
                  );
                }}
              >
                <LogOut /> Leave
              </Button>
            )}
          </div>
        </div>
      )}

      {learners && learners.length > 0 && (
        <>
          <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
            {c.canManage ? 'Learners' : 'Your team'}
          </h4>
          <ul className="mb-5 grid max-h-72 gap-3 overflow-y-auto pr-1">
            {learners.map((l) => (
              <li key={l.id} className="flex items-center gap-3">
                <Avatar
                  initials={initials(l.employee.firstName, l.employee.lastName)}
                  className="size-[30px] text-[11px]"
                />
                <span className="w-28 shrink-0 truncate font-semibold">{nameOf(l.employee)}</span>
                <ProgressBar
                  value={l.progress}
                  tone={l.progress >= 100 ? 'success' : 'primary'}
                  className="h-1.5"
                />
                <span className="w-10 text-right font-mono text-[13px]">{l.progress}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid gap-2">
        {c.canEnroll && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              act(
                () => api(`/learning/courses/${c.id}/enrol`, { method: 'POST' }),
                `You're signed up for ${c.title}`,
              )
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Sign up
          </Button>
        )}
        {c.meetingLink && (c.mine || c.canManage) && (
          <Button asChild>
            <a href={c.meetingLink} target="_blank" rel="noreferrer">
              <ExternalLink /> Open {MODES[c.mode]} link
            </a>
          </Button>
        )}
        {c.canManage && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => onDialog({ kind: 'assign', course: c })}>
              <UserPlus /> Enrol people
            </Button>
            <Button size="sm" onClick={() => onDialog({ kind: 'session', course: c })}>
              <CalendarPlus /> Add session
            </Button>
          </div>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete ${c.title} and everyone's progress on it?`)) return;
              void act(
                () => api(`/learning/courses/${c.id}`, { method: 'DELETE' }),
                'Course deleted',
              );
            }}
          >
            <Trash2 /> Delete course
          </Button>
        )}
      </div>
    </Card>
  );
}

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

function CourseDialog({
  course,
  hr,
  onDone,
}: {
  course: CourseItem | null;
  hr: boolean;
  onDone: (m: string) => void;
}) {
  const people = usePeople();
  const [departments, setDepartments] = useState<Named[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    title: course?.title ?? '',
    description: course?.description ?? '',
    category: course?.category ?? 'Engineering',
    leadId: course?.leadId ?? '',
    departmentId: course?.department?.id ?? '',
    mandatory: course?.mandatory ?? false,
    seats: course?.seats != null ? String(course.seats) : '',
    startsOn: course?.startsOn ?? today,
    endsOn: course?.endsOn ?? today,
    hours: String(course?.hours ?? 2),
    mode: (course?.mode ?? 'GOOGLE_MEET') as CourseMode,
    meetingLink: course?.meetingLink ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    api<Named[]>('/org/departments')
      .then(setDepartments)
      .catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = {
      title: f.title,
      description: f.description || null,
      category: f.category,
      leadId: f.leadId || null,
      startsOn: f.startsOn,
      endsOn: f.endsOn,
      hours: Number(f.hours) || 1,
      mode: f.mode,
      meetingLink: f.meetingLink,
      seats: f.seats ? Number(f.seats) : null,
    };
    if (hr) Object.assign(body, { departmentId: f.departmentId || null, mandatory: f.mandatory });
    try {
      if (course)
        await api(`/learning/courses/${course.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      else await api('/learning/courses', { method: 'POST', body: JSON.stringify(body) });
      onDone(
        course
          ? 'Course updated'
          : f.mandatory
            ? `Created ${f.title} and enrolled everyone in it`
            : `Created ${f.title}`,
      );
    } catch (err) {
      setError(errorText(err, 'Could not save the course'));
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={course ? 'Edit course' : 'Create course'}
      side="right"
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field id="cc-title" label="Title">
          <Input
            id="cc-title"
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            required
          />
        </Field>
        <Field id="cc-desc" label="What it covers (optional)">
          <Input
            id="cc-desc"
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cc-cat" label="Category">
            <Select
              id="cc-cat"
              value={f.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {[...new Set([...CATEGORIES, f.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field id="cc-lead" label="Lead">
            <Select id="cc-lead" value={f.leadId} onChange={(e) => set('leadId', e.target.value)}>
              <option value="">No lead</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {hr && (
          <>
            <ToggleRow
              title="Mandatory"
              caption="Everyone in the audience is enrolled straight away"
              checked={f.mandatory}
              onCheckedChange={(v) => set('mandatory', v)}
            />
            <Field id="cc-aud" label="Who it's for">
              <Select
                id="cc-aud"
                value={f.departmentId}
                onChange={(e) => set('departmentId', e.target.value)}
              >
                <option value="">Everyone</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} only
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cc-from" label="Starts">
            <Input
              id="cc-from"
              type="date"
              value={f.startsOn}
              onChange={(e) => set('startsOn', e.target.value)}
              required
            />
          </Field>
          <Field id="cc-to" label="Ends">
            <Input
              id="cc-to"
              type="date"
              value={f.endsOn}
              onChange={(e) => set('endsOn', e.target.value)}
              required
            />
          </Field>
          <Field id="cc-hours" label="Total hours">
            <Input
              id="cc-hours"
              type="number"
              min={0.5}
              step={0.5}
              value={f.hours}
              onChange={(e) => set('hours', e.target.value)}
            />
          </Field>
          {!f.mandatory && (
            <Field id="cc-seats" label="Seats (empty for no limit)">
              <Input
                id="cc-seats"
                type="number"
                min={1}
                value={f.seats}
                onChange={(e) => set('seats', e.target.value)}
              />
            </Field>
          )}
          <Field id="cc-mode" label="Where">
            <Select
              id="cc-mode"
              value={f.mode}
              onChange={(e) => set('mode', e.target.value as CourseMode)}
            >
              {Object.entries(MODES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {f.mode !== 'IN_PERSON' && (
            <Field id="cc-link" label="Link (optional)">
              <Input
                id="cc-link"
                type="url"
                value={f.meetingLink}
                onChange={(e) => set('meetingLink', e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </Field>
          )}
        </div>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {course ? 'Save' : 'Create course'}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function SessionDialog({ course, onDone }: { course: CourseItem; onDone: (m: string) => void }) {
  const [title, setTitle] = useState(`${course.title} · session`);
  const [date, setDate] = useState(
    course.startsOn > new Date().toISOString().slice(0, 10)
      ? course.startsOn
      : new Date().toISOString().slice(0, 10),
  );
  const [time, setTime] = useState('11:00');
  const [minutes, setMinutes] = useState('60');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  return (
    <DialogContent title="Add a session" aria-describedby={undefined}>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const startsAt = new Date(`${date}T${time}:00`).toISOString();
            await api(`/learning/courses/${course.id}/sessions`, {
              method: 'POST',
              body: JSON.stringify({
                title,
                startsAt,
                minutes: Number(minutes),
                location: location || null,
              }),
            });
            onDone('Session added');
          } catch (err) {
            setError(errorText(err, 'Could not add the session'));
          }
        }}
      >
        <Field id="s-title" label="Title">
          <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="s-date" label="Date">
            <Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="s-time" label="Time">
            <Input id="s-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="s-min" label="Minutes">
            <Input
              id="s-min"
              type="number"
              min={10}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        <Field id="s-loc" label={`Where (defaults to ${MODES[course.mode]})`}>
          <Input
            id="s-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Board room, Bengaluru"
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            <CalendarPlus /> Add session
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

function AssignDialog({ course, onDone }: { course: CourseItem; onDone: (m: string) => void }) {
  const people = usePeople();
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  useEffect(() => {
    api<LearnerItem[]>(`/learning/courses/${course.id}/learners`)
      .then((l) => setEnrolled(new Set(l.map((x) => x.employee.id))))
      .catch(() => undefined);
  }, [course.id]);
  const open = people.filter((p) => !enrolled.has(p.id));
  const left = course.seats != null ? course.seats - course.registered : null;

  return (
    <DialogContent
      title={`Enrol people in ${course.title}`}
      side="right"
      aria-describedby={undefined}
    >
      <div className="grid gap-4">
        {left != null && <p className="text-[13px] text-muted-foreground">{left} seats left.</p>}
        {open.length ? (
          <ul className="grid max-h-[55vh] gap-1 overflow-y-auto">
            {open.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/60">
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={(e) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  <span className="grow font-semibold">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.dept ?? ''}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="py-6">Everyone is already enrolled.</Empty>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button
            variant="primary"
            disabled={!picked.size}
            onClick={async () => {
              try {
                const r = await api<{ added: number }>(`/learning/courses/${course.id}/assign`, {
                  method: 'POST',
                  body: JSON.stringify({ employeeIds: [...picked] }),
                });
                onDone(`Enrolled ${r.added} ${r.added === 1 ? 'person' : 'people'}`);
              } catch (err) {
                setError(errorText(err, 'Could not enrol them'));
              }
            }}
          >
            <UserPlus /> Enrol {picked.size || ''}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}
