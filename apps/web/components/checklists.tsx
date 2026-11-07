'use client';

import { DOCUMENT_CATEGORIES } from '@hrms/shared';
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileUp,
  Loader2,
  Plus,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Avatar } from './ui/avatar';
import { Badge, type BadgeTone } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { Field, FormError, Input, Select } from './ui/input';
import { Empty } from './ui/page';
import { ProgressBar } from './ui/progress';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  api,
  ApiError,
  type Checklist,
  type ChecklistKind,
  type ChecklistTask,
  type ChecklistTemplate,
  type Employee,
  type Paged,
  type TaskAssignee,
  type TemplateTask,
} from '@/lib/api';
import { formatDate, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export const ASSIGNEE: Record<TaskAssignee, [string, BadgeTone]> = {
  HR: ['HR', 'accent'],
  MANAGER: ['Manager', 'info'],
  EMPLOYEE: ['Employee', 'success'],
  IT: ['IT', 'neutral'],
};

export const KIND_LABEL: Record<ChecklistKind, string> = {
  ONBOARDING: 'Onboarding',
  OFFBOARDING: 'Offboarding',
};

const STATUS: Record<Checklist['status'], [string, BadgeTone]> = {
  OPEN: ['In progress', 'accent'],
  COMPLETED: ['Done', 'success'],
  CANCELLED: ['Cancelled', 'neutral'],
};

export const nameOf = (c: Checklist) => `${c.employee.firstName} ${c.employee.lastName}`.trim();

const pct = (c: Checklist) =>
  c.progress.total ? Math.round((c.progress.done / c.progress.total) * 100) : 0;

/** One row in the checklist list: who, when, how far along, what's next. */
export function ChecklistRow({
  checklist: c,
  active,
  onClick,
}: {
  checklist: Checklist;
  active: boolean;
  onClick: () => void;
}) {
  const next = c.tasks.find((t) => !t.doneAt);
  const overdue = c.tasks.filter((t) => t.overdue).length;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'grid w-full cursor-pointer gap-3 rounded-2xl p-4 text-left transition-all',
        active ? 'bg-surface shadow-raised' : 'bg-surface-2/50 hover:bg-surface-2',
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar size="sm" initials={initials(c.employee.firstName, c.employee.lastName)} />
        <div className="min-w-0 grow">
          <div className="truncate font-bold">{nameOf(c)}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[c.employee.designation?.name, c.employee.department?.name]
              .filter(Boolean)
              .join(' · ') || c.employee.employeeCode}
          </div>
        </div>
        <Badge tone={c.kind === 'ONBOARDING' ? 'success' : 'warning'}>{KIND_LABEL[c.kind]}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={pct(c)} tone={c.status === 'COMPLETED' ? 'success' : 'primary'} />
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          {c.progress.done} / {c.progress.total}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {c.kind === 'ONBOARDING' ? 'Joins' : 'Last day'} {formatDate(c.startDate)}
        </span>
        {c.status === 'OPEN' && next && <span className="truncate">Next: {next.title}</span>}
        {overdue > 0 && <span className="font-bold text-danger">{overdue} overdue</span>}
        {c.status !== 'OPEN' && <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>}
      </div>
    </button>
  );
}

/** The selected checklist with its tasks, grouped by who does them. */
export function ChecklistDetail({
  checklist: c,
  onChange,
  onToast,
}: {
  checklist: Checklist;
  onChange: (c: Checklist) => void;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'date' | 'person'>('date');

  async function tick(t: ChecklistTask) {
    setBusy(t.id);
    try {
      const updated = await api<Checklist>(`/checklists/${c.id}/tasks/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !t.doneAt }),
      });
      onChange(updated);
      if (updated.status === 'COMPLETED' && c.status !== 'COMPLETED')
        onToast(
          c.kind === 'ONBOARDING'
            ? `${nameOf(c)} is fully onboarded and now Active`
            : `${nameOf(c)}’s exit is complete. Their login is turned off.`,
        );
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not update the task');
    } finally {
      setBusy(null);
    }
  }

  async function removeTask(t: ChecklistTask) {
    try {
      onChange(await api<Checklist>(`/checklists/${c.id}/tasks/${t.id}`, { method: 'DELETE' }));
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not remove the task');
    }
  }

  async function cancel() {
    const msg =
      c.kind === 'OFFBOARDING'
        ? `Cancel ${nameOf(c)}’s exit? They go back to Active.`
        : `Cancel ${nameOf(c)}’s onboarding checklist?`;
    if (!window.confirm(msg)) return;
    try {
      onChange(await api<Checklist>(`/checklists/${c.id}/cancel`, { method: 'POST' }));
      onToast('Checklist cancelled');
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : 'Could not cancel');
    }
  }

  const groups: [string, ChecklistTask[]][] =
    view === 'person'
      ? (Object.keys(ASSIGNEE) as TaskAssignee[])
          .map(
            (a) =>
              [ASSIGNEE[a][0], c.tasks.filter((t) => t.assignee === a)] as [
                string,
                ChecklistTask[],
              ],
          )
          .filter(([, ts]) => ts.length)
      : ([
          ['To do', c.tasks.filter((t) => !t.doneAt)],
          ['Done', c.tasks.filter((t) => t.doneAt)],
        ].filter(([, ts]) => (ts as ChecklistTask[]).length) as [string, ChecklistTask[]][]);

  return (
    <Card className="content-start">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar initials={initials(c.employee.firstName, c.employee.lastName)} />
          <div className="min-w-0">
            <CardTitle className="truncate">
              <Link href={`/employees/${c.employee.id}`} className="text-inherit no-underline">
                {nameOf(c)}
              </Link>
            </CardTitle>
            <CardDescription>
              {KIND_LABEL[c.kind]} · {c.kind === 'ONBOARDING' ? 'joins' : 'last day'}{' '}
              {formatDate(c.startDate)}
              {c.reason ? ` · ${c.reason.replace('_', ' ').toLowerCase()}` : ''}
            </CardDescription>
          </div>
        </div>
        <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
      </CardHeader>

      <div className="mb-5 flex items-center gap-3">
        <ProgressBar value={pct(c)} tone={c.status === 'COMPLETED' ? 'success' : 'primary'} />
        <span className="font-mono text-[13px] whitespace-nowrap">{pct(c)}%</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="date">By status</TabsTrigger>
            <TabsTrigger value="person">By person</TabsTrigger>
          </TabsList>
        </Tabs>
        {c.canManage && c.status !== 'CANCELLED' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAdding((a) => !a)}>
              <Plus /> Add task
            </Button>
            {c.status === 'OPEN' && (
              <Button size="sm" variant="ghost" onClick={cancel}>
                <XCircle /> Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {adding && (
        <AddTask
          checklist={c}
          onAdded={(updated) => {
            setAdding(false);
            onChange(updated);
          }}
        />
      )}

      <div className="grid gap-5">
        {groups.map(([label, tasks]) => (
          <section key={label} className="grid gap-2">
            <h4 className="text-xs font-bold tracking-[0.1em] text-detail uppercase">
              {label} · {tasks.length}
            </h4>
            <ul className="grid gap-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    'flex items-start gap-3 rounded-[14px] p-3',
                    t.doneAt ? 'bg-surface-2/40' : 'bg-surface-2/70',
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={Boolean(t.doneAt)}
                    aria-label={t.title}
                    disabled={!t.canTick || busy === t.id}
                    onClick={() => tick(t)}
                    title={t.canTick ? undefined : `This is for ${ASSIGNEE[t.assignee][0]}`}
                    className={cn(
                      'mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg transition-all disabled:cursor-not-allowed',
                      t.doneAt
                        ? 'bg-success text-surface'
                        : 'bg-surface shadow-inset-sm enabled:cursor-pointer enabled:hover:shadow-raised-sm',
                      !t.canTick && !t.doneAt && 'opacity-50',
                    )}
                  >
                    {busy === t.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : t.doneAt ? (
                      <Check className="size-4" />
                    ) : null}
                  </button>
                  <div className="min-w-0 grow">
                    <div
                      className={cn(
                        'font-semibold',
                        t.doneAt && 'text-muted-foreground line-through decoration-1',
                      )}
                    >
                      {t.title}
                    </div>
                    {t.description && (
                      <div className="text-[13px] text-muted-foreground">{t.description}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Badge tone={ASSIGNEE[t.assignee][1]}>{ASSIGNEE[t.assignee][0]}</Badge>
                      <span className={cn(t.overdue && 'font-bold text-danger')}>
                        {t.overdue ? 'Overdue · ' : 'Due '}
                        {formatDate(t.dueDate)}
                      </span>
                      {t.doneAt && (
                        <span>
                          Done {formatDate(t.doneAt)}
                          {t.doneBy ? ` by ${t.doneBy}` : ''}
                        </span>
                      )}
                      {t.documentCategory && !t.doneAt && (
                        <Link
                          href="/documents"
                          className="inline-flex items-center gap-1 font-bold"
                        >
                          <FileUp className="size-3.5" /> Upload {t.documentCategory}
                        </Link>
                      )}
                    </div>
                  </div>
                  {c.canManage && c.status !== 'CANCELLED' && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${t.title}`}
                      onClick={() => removeTask(t)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {c.tasks.length === 0 && <Empty className="py-8">No tasks on this checklist.</Empty>}
      </div>
    </Card>
  );
}

const ASSIGNEES = Object.keys(ASSIGNEE) as TaskAssignee[];

function AddTask({
  checklist,
  onAdded,
}: {
  checklist: Checklist;
  onAdded: (c: Checklist) => void;
}) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<TaskAssignee>('HR');
  const [dueDate, setDueDate] = useState(checklist.startDate);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onAdded(
        await api<Checklist>(`/checklists/${checklist.id}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ title, assignee, dueDate }),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the task');
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-5 grid gap-3 rounded-2xl bg-surface-2/60 p-4 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end"
    >
      <Field id="at-title" label="Task">
        <Input id="at-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field id="at-who" label="Who">
        <Select
          id="at-who"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as TaskAssignee)}
        >
          {ASSIGNEES.map((a) => (
            <option key={a} value={a}>
              {ASSIGNEE[a][0]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="at-due" label="Due">
        <Input
          id="at-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={!title.trim()}>
        <Plus /> Add
      </Button>
      {error && (
        <div className="sm:col-span-4">
          <FormError>{error}</FormError>
        </div>
      )}
    </form>
  );
}

const REASONS = [
  ['RESIGNATION', 'Resignation'],
  ['TERMINATION', 'Termination'],
  ['RETIREMENT', 'Retirement'],
  ['CONTRACT_END', 'End of contract'],
  ['OTHER', 'Other'],
] as const;

/** HR starts an exit (or a fresh onboarding) for someone. */
export function StartChecklistDialog({
  kind,
  employee: fixed,
  onStarted,
}: {
  kind: ChecklistKind;
  employee?: { id: string; name: string };
  onStarted: (c: Checklist) => void;
}) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [employeeId, setEmployeeId] = useState(fixed?.id ?? '');
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (kind === 'OFFBOARDING' ? 30 : 0));
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState('RESIGNATION');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ChecklistTemplate[]>(`/checklist-templates?kind=${kind}`)
      .then((ts) => {
        setTemplates(ts);
        setTemplateId(ts.find((t) => t.isDefault)?.id ?? ts[0]?.id ?? '');
      })
      .catch(() => setError('Could not load checklist templates.'));
    if (!fixed)
      api<Paged<Employee>>(
        `/employees?pageSize=100${kind === 'OFFBOARDING' ? '' : '&status=ONBOARDING'}`,
      )
        .then((r) => {
          const list = r.items.filter((e) => e.status !== 'EXITED');
          setPeople(list);
          setEmployeeId((id) => id || list[0]?.id || '');
        })
        .catch(() => undefined);
  }, [kind, fixed]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onStarted(
        await api<Checklist>(`/employees/${employeeId}/checklists`, {
          method: 'POST',
          body: JSON.stringify({
            kind,
            templateId,
            startDate,
            ...(kind === 'OFFBOARDING' ? { reason } : {}),
          }),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the checklist');
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={kind === 'OFFBOARDING' ? 'Start offboarding' : 'Start onboarding'}
      aria-describedby={undefined}
    >
      <form onSubmit={submit} className="grid gap-4">
        {fixed ? (
          <p className="font-semibold">{fixed.name}</p>
        ) : (
          <Field id="sc-emp" label="Employee">
            <Select
              id="sc-emp"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} · {p.employeeCode}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sc-date" label={kind === 'OFFBOARDING' ? 'Last working day' : 'Joining date'}>
            <Input
              id="sc-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </Field>
          {kind === 'OFFBOARDING' && (
            <Field id="sc-reason" label="Reason">
              <Select id="sc-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field id="sc-template" label="Checklist">
          <Select
            id="sc-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (default)' : ''} · {t.tasks.length} tasks
              </option>
            ))}
          </Select>
        </Field>
        {kind === 'OFFBOARDING' && (
          <p className="text-[13px] text-muted-foreground">
            They show as On notice until the checklist is finished. Finishing it marks them as left
            and turns off their login.
          </p>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!employeeId || !templateId || busy}>
            {busy && <Loader2 className="animate-spin" />}
            Start {kind === 'OFFBOARDING' ? 'offboarding' : 'onboarding'}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}

/** HR edits the reusable checklists: tasks, who does them, when, and which is the default. */
export function TemplatesDialog({ onToast }: { onToast: (m: string) => void }) {
  const [kind, setKind] = useState<ChecklistKind>('ONBOARDING');
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<{
    name: string;
    tasks: TemplateTask[];
    isDefault: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ChecklistTemplate[]>(`/checklist-templates?kind=${kind}`)
      .then((ts) => {
        setTemplates(ts);
        const first = ts.find((t) => t.isDefault) ?? ts[0];
        setSelectedId(first?.id ?? 'new');
        setDraft(
          first
            ? { name: first.name, tasks: first.tasks, isDefault: first.isDefault }
            : { name: '', tasks: [], isDefault: true },
        );
      })
      .catch(() => setError('Could not load templates.'));
  }, [kind]);

  function pick(id: string) {
    setSelectedId(id);
    setError('');
    const t = templates.find((x) => x.id === id);
    setDraft(
      t
        ? { name: t.name, tasks: t.tasks, isDefault: t.isDefault }
        : { name: '', tasks: [{ title: '', assignee: 'HR', dueOffsetDays: 0 }], isDefault: false },
    );
  }

  const setTask = (i: number, patch: Partial<TemplateTask>) =>
    setDraft(
      (d) => d && { ...d, tasks: d.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) },
    );
  const move = (i: number, by: number) =>
    setDraft((d) => {
      if (!d) return d;
      const tasks = [...d.tasks];
      const [t] = tasks.splice(i, 1);
      tasks.splice(i + by, 0, t!);
      return { ...d, tasks };
    });

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    const tasks = draft.tasks
      .filter((t) => t.title.trim())
      .map((t) => ({ ...t, documentCategory: t.documentCategory || null }));
    try {
      const saved =
        selectedId === 'new'
          ? await api<ChecklistTemplate>('/checklist-templates', {
              method: 'POST',
              body: JSON.stringify({ name: draft.name, kind, isDefault: draft.isDefault, tasks }),
            })
          : await api<ChecklistTemplate>(`/checklist-templates/${selectedId}`, {
              method: 'PATCH',
              body: JSON.stringify({
                name: draft.name,
                isDefault: draft.isDefault || undefined,
                tasks,
              }),
            });
      const fresh = await api<ChecklistTemplate[]>(`/checklist-templates?kind=${kind}`);
      setTemplates(fresh);
      setSelectedId(saved.id);
      onToast(`Saved ${saved.name}. New checklists will use it.`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A template with that name already exists.'
          : err instanceof ApiError
            ? err.message
            : 'Could not save the template.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this template? Checklists already started keep their tasks.'))
      return;
    try {
      await api(`/checklist-templates/${selectedId}`, { method: 'DELETE' });
      const fresh = await api<ChecklistTemplate[]>(`/checklist-templates?kind=${kind}`);
      setTemplates(fresh);
      const def = fresh.find((t) => t.isDefault) ?? fresh[0];
      if (def) pick(def.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete');
    }
  }

  const current = templates.find((t) => t.id === selectedId);

  return (
    <DialogContent
      title="Checklist templates"
      side="right"
      className="max-w-3xl"
      aria-describedby={undefined}
    >
      <div className="grid gap-5">
        <Tabs value={kind} onValueChange={(v) => setKind(v as ChecklistKind)}>
          <TabsList>
            <TabsTrigger value="ONBOARDING">Onboarding</TabsTrigger>
            <TabsTrigger value="OFFBOARDING">Offboarding</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={cn(
                'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold',
                selectedId === t.id
                  ? 'bg-primary text-primary-foreground shadow-glow'
                  : 'bg-surface text-muted-foreground shadow-raised-sm',
              )}
            >
              {t.isDefault && <Star className="size-3.5 fill-current" />}
              {t.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick('new')}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold',
              selectedId === 'new'
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'bg-surface text-muted-foreground shadow-raised-sm',
            )}
          >
            <Plus className="size-3.5" /> New template
          </button>
        </div>

        {draft && (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field id="tp-name" label="Template name">
                <Input
                  id="tp-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={kind === 'ONBOARDING' ? 'Sales onboarding' : 'Contractor exit'}
                />
              </Field>
              <label className="flex items-center gap-2 pb-3 text-[13.5px] font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft.isDefault}
                  disabled={current?.isDefault}
                  onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
                />
                Use by default
              </label>
            </div>

            <ol className="grid gap-2">
              {draft.tasks.map((t, i) => (
                <li
                  key={i}
                  className="grid gap-2 rounded-2xl bg-surface-2/60 p-3 sm:grid-cols-[1fr_120px_96px_150px_auto] sm:items-center"
                >
                  <Input
                    aria-label={`Task ${i + 1}`}
                    value={t.title}
                    onChange={(e) => setTask(i, { title: e.target.value })}
                    placeholder="What needs doing"
                    className="h-9"
                  />
                  <Select
                    aria-label="Who"
                    value={t.assignee}
                    onChange={(e) => setTask(i, { assignee: e.target.value as TaskAssignee })}
                    className="h-9"
                  >
                    {ASSIGNEES.map((a) => (
                      <option key={a} value={a}>
                        {ASSIGNEE[a][0]}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Input
                      aria-label="Due, days from the date"
                      type="number"
                      value={t.dueOffsetDays}
                      onChange={(e) => setTask(i, { dueOffsetDays: Number(e.target.value) || 0 })}
                      className="h-9 w-16 px-2"
                    />
                    days
                  </label>
                  <Select
                    aria-label="Document to upload"
                    value={t.documentCategory ?? ''}
                    onChange={(e) => setTask(i, { documentCategory: e.target.value || null })}
                    className="h-9"
                  >
                    <option value="">No document</option>
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move down"
                      disabled={i === draft.tasks.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove task"
                      onClick={() =>
                        setDraft({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Days count from the joining date for onboarding and the last working day for
              offboarding. Use a minus number for tasks that happen before it.
            </p>
            <div>
              <Button
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tasks: [...draft.tasks, { title: '', assignee: 'HR', dueOffsetDays: 0 }],
                  })
                }
              >
                <Plus /> Add task
              </Button>
            </div>
            <FormError>{error}</FormError>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={save}
                disabled={busy || !draft.name.trim() || !draft.tasks.some((t) => t.title.trim())}
              >
                {busy && <Loader2 className="animate-spin" />}
                Save template
              </Button>
              {current && !current.isDefault && (
                <Button variant="danger" onClick={remove}>
                  <Trash2 /> Delete
                </Button>
              )}
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  );
}

/** Card on a person's page: their open (or latest) checklist, and HR's way to start an exit. */
export function ProfileChecklistCard({
  employee,
  canManage,
  onChanged,
}: {
  employee: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'status'>;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Checklist[] | null>(null);
  const [starting, setStarting] = useState(false);

  const load = () =>
    api<Checklist[]>(`/checklists?employeeId=${employee.id}`)
      .then(setItems)
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  if (!items) return null;
  const current = items.find((c) => c.status === 'OPEN') ?? items[0];
  const canStartExit =
    canManage &&
    employee.status !== 'EXITED' &&
    !items.some((c) => c.status === 'OPEN' && c.kind === 'OFFBOARDING');
  if (!current && !canStartExit) return null;

  const open = current?.tasks.filter((t) => !t.doneAt).slice(0, 3) ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{current ? KIND_LABEL[current.kind] : 'Joining and leaving'}</CardTitle>
          <CardDescription>
            {current
              ? `${current.progress.done} of ${current.progress.total} tasks done`
              : 'No checklist running'}
          </CardDescription>
        </div>
        {current && <Badge tone={STATUS[current.status][1]}>{STATUS[current.status][0]}</Badge>}
      </CardHeader>
      {current && (
        <>
          <ProgressBar
            value={pct(current)}
            tone={current.status === 'COMPLETED' ? 'success' : 'primary'}
            className="mb-4"
          />
          {open.length > 0 && (
            <ul className="mb-4 grid gap-2.5">
              {open.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5 text-[13.5px]">
                  <span className="size-4 shrink-0 rounded-md bg-surface-2 shadow-inset-sm" />
                  <span className={cn('grow', t.overdue && 'text-danger')}>{t.title}</span>
                  <Badge tone={ASSIGNEE[t.assignee][1]}>{ASSIGNEE[t.assignee][0]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2.5">
        {current && (
          <Button size="sm" asChild>
            <Link href={`/lifecycle?checklist=${current.id}`}>Open checklist</Link>
          </Button>
        )}
        {canStartExit && (
          <Button size="sm" variant="ghost" onClick={() => setStarting(true)}>
            Start offboarding
          </Button>
        )}
      </div>
      <Dialog open={starting} onOpenChange={setStarting}>
        {starting && (
          <StartChecklistDialog
            kind="OFFBOARDING"
            employee={{
              id: employee.id,
              name: `${employee.firstName} ${employee.lastName}`.trim(),
            }}
            onStarted={() => {
              setStarting(false);
              void load();
              onChanged?.();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}
