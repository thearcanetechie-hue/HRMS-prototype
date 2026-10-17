'use client';

import {
  Bell,
  BookOpen,
  Clock,
  GraduationCap,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileDrop, LegendDot, Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { DemoBadge, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton, StackedBar } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLearningOverview, type Course, type LearningOverview } from '@/lib/demo/learning';
import { titleCase } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<Course['status'], BadgeTone> = {
  ongoing: 'accent',
  upcoming: 'warning',
  completed: 'success',
};
const ICON: Record<string, LucideIcon> = {
  Compliance: ShieldCheck,
  Engineering: GraduationCap,
  Sales: TrendingUp,
  Leadership: Users,
  Finance: BookOpen,
};
const FILTERS = ['all', 'ongoing', 'upcoming', 'completed', 'mandatory'] as const;
const TEAMS = ['All teams', 'Engineering', 'Sales'];

const iconFor = (c: Course) =>
  ICON[Object.keys(ICON).find((k) => c.category.includes(k)) ?? ''] ?? GraduationCap;

export default function LearningPage() {
  const [data, setData] = useState<LearningOverview | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [team, setTeam] = useState(TEAMS[0]);
  const [selectedId, setSelectedId] = useState('posh');
  const [creating, setCreating] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getLearningOverview().then(setData);
  }, []);

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Growth" title="Learning & development" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const courses = data.courses.filter(
    (c) =>
      (filter === 'all' || (filter === 'mandatory' ? c.mandatory : c.status === filter)) &&
      (team === 'All teams' || c.team === team),
  );
  const selected = data.courses.find((c) => c.id === selectedId) ?? data.courses[0];
  const learners = (selected && data.learners[selected.id]) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Learning & development <DemoBadge />
          </span>
        }
        description="Courses run by your company, who has signed up and how far along they are."
        actions={
          <>
            <Button onClick={() => showToast('The course library is coming soon')}>
              <BookOpen /> Course library
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> Create course
            </Button>
          </>
        }
      />

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<GraduationCap />}
            value={data.courses.filter((c) => c.status === 'ongoing').length}
            label="Running courses"
            delta={`${data.courses.filter((c) => c.mandatory).length} mandatory`}
          />
          <StatCard
            icon={<Users />}
            tone="info"
            value={data.courses.reduce((a, c) => a + c.registered, 0)}
            label="Registrations"
            delta="+38 this month"
          />
          <StatCard
            icon={<TrendingUp />}
            tone="success"
            value="61%"
            label="Avg completion"
            delta="+7%"
          />
          <StatCard
            icon={<Clock />}
            tone="detail"
            value="1,320 h"
            label="Learning hours"
            delta="This quarter"
            deltaTone="info"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {f === 'all' ? 'All courses' : titleCase(f)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            {TEAMS.map((t) => (
              <Chip key={t} active={team === t} onClick={() => setTeam(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <Card className="min-w-0 content-start">
            <CardHeader>
              <div>
                <CardTitle>Courses</CardTitle>
                <CardDescription>Listed course by course · sorted by start date</CardDescription>
              </div>
            </CardHeader>
            {courses.length ? (
              <ul className="grid gap-2">
                {courses.map((c, i) => {
                  const Icon = iconFor(c);
                  const on = c.id === selected?.id;
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
                              {c.category} · Led by {c.lead}
                            </div>
                            <Badge tone={STATUS_TONE[c.status]} className="mt-1.5">
                              {titleCase(c.status)}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Schedule</div>
                          <div className="font-semibold whitespace-nowrap">{c.schedule}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Registered</div>
                          <div className="whitespace-nowrap">
                            <span className="text-xl font-extrabold tabular">{c.registered}</span>{' '}
                            <span className="text-[13px] text-muted-foreground">/ {c.seats}</span>
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            Avg progress
                            <span className="font-mono font-bold text-foreground">{c.avg}%</span>
                          </div>
                          <StackedBar
                            segments={[
                              {
                                label: 'Done',
                                value: (c.done / c.registered) * 100,
                                tone: 'success',
                              },
                              {
                                label: 'In progress',
                                value: (c.inProgress / c.registered) * 100,
                                tone: 'primary',
                              },
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
              <Empty>No courses match these filters</Empty>
            )}
          </Card>

          <div className="grid content-start gap-5">
            {selected && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>{selected.title}</CardTitle>
                    <CardDescription>
                      {selected.mandatory ? 'Mandatory for everyone' : `Led by ${selected.lead}`}
                      {selected.due ? ` · due ${selected.due}` : ` · ${selected.schedule}`}
                    </CardDescription>
                  </div>
                </CardHeader>
                <div className="mb-5 flex flex-wrap items-center gap-5">
                  <ProgressRing
                    size={116}
                    value={(selected.done / selected.registered) * 100}
                    label="Course completion"
                    caption="done"
                  />
                  <div className="grid gap-2">
                    <LegendDot className="bg-success" label="Completed" value={selected.done} />
                    <LegendDot
                      className="bg-primary"
                      label="In progress"
                      value={selected.inProgress}
                    />
                    <LegendDot
                      className="bg-muted-foreground/30"
                      label="Not started"
                      value={selected.notStarted}
                    />
                  </div>
                </div>
                {learners.length > 0 && (
                  <>
                    <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
                      Learners
                    </h4>
                    <ul className="mb-5 grid gap-3">
                      {learners.map((l) => (
                        <li key={l.employee.name} className="flex items-center gap-3">
                          <Avatar
                            initials={l.employee.initials}
                            className="size-[30px] text-[11px]"
                          />
                          <span className="w-28 shrink-0 truncate font-semibold">
                            {l.employee.name}
                          </span>
                          <ProgressBar value={l.progress} className="h-1.5" />
                          <span className="w-10 text-right font-mono text-[13px]">
                            {l.progress}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {selected.status !== 'completed' && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      showToast(
                        `Reminded ${selected.inProgress + selected.notStarted} people about ${selected.title}`,
                      )
                    }
                  >
                    <Bell /> Remind {selected.inProgress + selected.notStarted} people
                  </Button>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Next sessions</CardTitle>
                  <CardDescription>This week</CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-3.5">
                {data.sessions.map((s) => (
                  <li key={s.title + s.day} className="flex items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center content-center rounded-[14px] bg-primary/8 leading-tight text-primary">
                      <span className="text-[11px] font-bold uppercase">{s.weekday}</span>
                      <span className="text-lg font-extrabold tabular">{s.day}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.at}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <CreateCourse
            onCreate={(c) => {
              setData((d) => d && { ...d, courses: [c, ...d.courses] });
              setSelectedId(c.id);
              setCreating(false);
              showToast(`Created ${c.title}`);
            }}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function CreateCourse({ onCreate }: { onCreate: (c: Course) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Engineering');
  const [lead, setLead] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [audience, setAudience] = useState('everyone');
  const [seats, setSeats] = useState('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sessions, setSessions] = useState('4');
  const [link, setLink] = useState('google-meet');
  const [file, setFile] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const fmt = (d: string) =>
      d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
    const n = Number(seats) || 0;
    onCreate({
      id: `c${Date.now()}`,
      title: title.trim(),
      category: `${mandatory ? 'Mandatory · ' : ''}${category} · ${sessions} sessions`,
      lead: lead || 'You',
      team: audience === 'everyone' ? 'All' : category,
      mandatory,
      schedule: [fmt(from), fmt(to)].filter(Boolean).join(' – ') || 'To be scheduled',
      registered: 0,
      seats: n,
      done: 0,
      inProgress: 0,
      notStarted: 0,
      avg: 0,
      status: 'upcoming',
    });
  }

  return (
    <DialogContent title="Create course" side="right" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        <Field id="cc-title" label="Title">
          <Input id="cc-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cc-cat" label="Category">
            <Select id="cc-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {['Engineering', 'Sales', 'Leadership', 'Finance', 'Compliance'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field id="cc-lead" label="Lead">
            <Input
              id="cc-lead"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              placeholder="Search employees"
            />
          </Field>
        </div>
        <ToggleRow
          title="Mandatory"
          caption="Everyone in the audience must finish it"
          checked={mandatory}
          onCheckedChange={setMandatory}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cc-aud" label="Audience">
            <Select id="cc-aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="everyone">Everyone</option>
              <option value="teams">Selected teams</option>
              <option value="people">Selected people</option>
            </Select>
          </Field>
          <Field id="cc-seats" label="Seats">
            <Input
              id="cc-seats"
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </Field>
          <Field id="cc-from" label="Starts">
            <Input
              id="cc-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id="cc-to" label="Ends">
            <Input id="cc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field id="cc-sessions" label="Sessions">
            <Input
              id="cc-sessions"
              type="number"
              min={1}
              value={sessions}
              onChange={(e) => setSessions(e.target.value)}
            />
          </Field>
          <Field id="cc-link" label="Meeting link">
            <Select id="cc-link" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="google-meet">Google Meet</option>
              <option value="zoom">Zoom</option>
              <option value="teams">Microsoft Teams</option>
              <option value="in-person">In person</option>
            </Select>
          </Field>
        </div>
        <FileDrop
          title={file || 'Add materials'}
          caption="Slides, PDFs or videos"
          onFile={(f) => setFile(f.name)}
          className="py-6"
        />
        <div className="flex gap-3">
          <Button variant="primary" type="submit">
            Create course
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
