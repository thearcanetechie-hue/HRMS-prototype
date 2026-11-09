'use client';

import { QUESTION_KINDS, type QuestionKind } from '@hrms/shared';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Lock,
  Plus,
  Save,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/input';
import { Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import {
  type Assessment,
  blankQuestion,
  KIND_NAME,
  nextOptionId,
  PURPOSE_NAME,
  type Purpose,
  type Question,
  type ResultsVisibility,
  STATUS_NAME,
  STATUS_TONE,
} from '@/lib/assessments';
import { formatDate } from '@/lib/format';

type Full = Assessment & { questions: (Question & { id: string })[] };
interface Results {
  summary: {
    assigned: number;
    completed: number;
    passed: number;
    toMark: number;
    average: number | null;
  };
  rows: {
    employee: { id: string; firstName: string; lastName: string; employeeCode: string };
    dueAt: string | null;
    attempts: number;
    state: 'PASSED' | 'FAILED' | 'TO_MARK' | 'IN_PROGRESS' | 'OVERDUE' | 'NOT_STARTED';
    best: { id: string; percent: string | null } | null;
    attemptIds: string[];
  }[];
}
const STATE: Record<Results['rows'][number]['state'], [string, BadgeTone]> = {
  PASSED: ['Passed', 'success'],
  FAILED: ['Not passed', 'danger'],
  TO_MARK: ['To mark', 'warning'],
  IN_PROGRESS: ['Taking it', 'info'],
  OVERDUE: ['Overdue', 'danger'],
  NOT_STARTED: ['Not started', 'neutral'],
};

/** datetime-local value from an ISO date, in the browser's time zone. */
const localInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function AssessmentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [a, setA] = useState<Full | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [tab, setTab] = useState('questions');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    const full = await api<Full>(`/assessments/${id}`);
    setA(full);
    setQuestions(full.questions);
    setDirty(false);
    if (full.status !== 'DRAFT') {
      setResults(await api<Results>(`/assessments/${id}/results`));
    }
  }, [id]);
  useEffect(() => {
    void load().catch(() => setError('Could not load this assessment.'));
  }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (done) showToast(done);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  const saveSettings = (patch: Partial<Assessment>) =>
    run(() => api(`/assessments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }), 'Saved');

  const saveQuestions = () =>
    run(
      () =>
        api(`/assessments/${id}/questions`, {
          method: 'PUT',
          body: JSON.stringify({
            questions: questions.map(({ id: _id, ...q }) => q),
          }),
        }),
      'Questions saved',
    );

  const editQ = (i: number, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    setDirty(true);
  };
  const moveQ = (i: number, by: number) => {
    setQuestions((qs) => {
      const next = [...qs];
      const [q] = next.splice(i, 1);
      next.splice(i + by, 0, q!);
      return next;
    });
    setDirty(true);
  };

  if (error && !a)
    return (
      <Card>
        <Empty>{error}</Empty>
      </Card>
    );
  if (!a) return <Skeleton className="h-96 rounded-2xl" />;

  const locked = Boolean(results && results.rows.some((r) => r.attempts > 0));
  const total = questions.reduce((n, q) => n + q.points, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/assessments" className="hover:underline">
            Assessments
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.title} <Badge tone={STATUS_TONE[a.status]}>{STATUS_NAME[a.status]}</Badge>
          </span>
        }
        description={`${questions.length} questions · ${total} points · pass mark ${a.passPercent}%`}
        actions={
          <>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const c = await api<{ id: string }>(`/assessments/${id}/copy`, {
                    method: 'POST',
                  });
                  router.push(`/assessments/${c.id}`);
                })
              }
            >
              <Copy /> Copy
            </Button>
            {a.status === 'DRAFT' && (
              <Button
                variant="primary"
                disabled={busy || dirty}
                title={dirty ? 'Save the questions first' : undefined}
                onClick={() =>
                  void run(() => api(`/assessments/${id}/publish`, { method: 'POST' }), 'Published')
                }
              >
                <Send /> Publish
              </Button>
            )}
            {a.status === 'PUBLISHED' && (
              <>
                <Button variant="primary" onClick={() => setAssigning(true)}>
                  <UserPlus /> Assign people
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        'Close it? Nobody can start it after this, and anyone mid-way is submitted.',
                      )
                    )
                      void run(() => api(`/assessments/${id}/close`, { method: 'POST' }), 'Closed');
                  }}
                >
                  <Lock /> Close
                </Button>
              </>
            )}
          </>
        }
      />
      {error && <FormError>{error}</FormError>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {results && (
            <TabsTrigger value="results">Results ({results.summary.completed})</TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {tab === 'settings' && (
        <Settings
          a={a}
          busy={busy}
          onSave={saveSettings}
          onDelete={() =>
            confirm('Delete this assessment?') &&
            void run(async () => {
              await api(`/assessments/${id}`, { method: 'DELETE' });
              router.push('/assessments');
            })
          }
        />
      )}

      {tab === 'questions' && (
        <div className="grid gap-4">
          {locked && (
            <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted-foreground">
              People have started this, so the questions are locked. Use Copy to make a new version.
            </p>
          )}
          {questions.map((q, i) => (
            <QuestionCard
              key={i}
              n={i + 1}
              q={q}
              locked={locked}
              first={i === 0}
              last={i === questions.length - 1}
              onChange={(p) => editQ(i, p)}
              onMove={(by) => moveQ(i, by)}
              onRemove={() => {
                setQuestions((qs) => qs.filter((_, j) => j !== i));
                setDirty(true);
              }}
            />
          ))}
          {!locked && (
            <Card className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-[13px] font-semibold text-muted-foreground">
                Add a question:
              </span>
              {QUESTION_KINDS.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  onClick={() => {
                    setQuestions((qs) => [...qs, blankQuestion(k)]);
                    setDirty(true);
                  }}
                >
                  <Plus /> {KIND_NAME[k].replace(' (marked by hand)', '')}
                </Button>
              ))}
            </Card>
          )}
          {!locked && (
            <div className="sticky bottom-4 flex justify-end">
              <Button
                variant="primary"
                size="lg"
                disabled={busy || !dirty}
                onClick={() => void saveQuestions()}
              >
                <Save /> {dirty ? 'Save questions' : 'Saved'}
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'results' && results && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                {results.summary.completed} of {results.summary.assigned} done ·{' '}
                {results.summary.passed} passed
                {results.summary.average !== null && ` · average ${results.summary.average}%`}
                {results.summary.toMark ? ` · ${results.summary.toMark} to mark` : ''}
              </CardDescription>
            </div>
          </CardHeader>
          {results.rows.length ? (
            <Table bare>
              <THead>
                <tr>
                  <TH>Person</TH>
                  <TH>State</TH>
                  <TH className="text-right">Best score</TH>
                  <TH className="text-right">Attempts</TH>
                  <TH>Due</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {results.rows.map((r) => (
                  <TR key={r.employee.id}>
                    <TD className="font-semibold">
                      {r.employee.firstName} {r.employee.lastName}
                      <div className="text-xs font-normal text-muted-foreground">
                        {r.employee.employeeCode}
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={STATE[r.state][1]}>{STATE[r.state][0]}</Badge>
                    </TD>
                    <TD className="text-right font-mono">
                      {r.best?.percent != null ? `${Number(r.best.percent)}%` : '–'}
                    </TD>
                    <TD className="text-right font-mono">{r.attempts}</TD>
                    <TD>{r.dueAt ? formatDate(r.dueAt) : '–'}</TD>
                    <TD className="text-right">
                      {r.best && (
                        <Button
                          asChild
                          size="sm"
                          variant={r.state === 'TO_MARK' ? 'primary' : 'ghost'}
                        >
                          <Link href={`/assessments/attempt/${r.best.id}`}>
                            {r.state === 'TO_MARK' ? 'Mark' : 'View'}
                          </Link>
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty>Nobody is assigned yet.</Empty>
          )}
        </Card>
      )}

      <AssignDialog
        open={assigning}
        id={id}
        onClose={() => setAssigning(false)}
        onDone={(msg) => {
          setAssigning(false);
          showToast(msg);
          setTab('results');
          void load();
        }}
      />
      <Toast message={toast} />
    </>
  );
}

function Settings({
  a,
  busy,
  onSave,
  onDelete,
}: {
  a: Assessment;
  busy: boolean;
  onSave: (patch: Partial<Assessment>) => void;
  onDelete: () => void;
}) {
  const [s, setS] = useState(a);
  useEffect(() => setS(a), [a]);
  const set = <K extends keyof Assessment>(k: K, v: Assessment[K]) =>
    setS((x) => ({ ...x, [k]: v }));
  return (
    <Card className="grid max-w-3xl gap-4">
      <Field id="title" label="Title">
        <Input id="title" value={s.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field id="desc" label="Instructions for people taking it">
        <textarea
          id="desc"
          rows={3}
          value={s.description}
          onChange={(e) => set('description', e.target.value)}
          className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="purpose" label="Used for">
          <Select
            id="purpose"
            value={s.purpose}
            onChange={(e) => set('purpose', e.target.value as Purpose)}
          >
            {Object.entries(PURPOSE_NAME).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pass" label="Pass mark (%)">
          <Input
            id="pass"
            type="number"
            min={0}
            max={100}
            value={s.passPercent}
            onChange={(e) => set('passPercent', Number(e.target.value))}
          />
        </Field>
        <Field id="limit" label="Time limit (minutes, empty for none)">
          <Input
            id="limit"
            type="number"
            min={1}
            value={s.timeLimitMinutes ?? ''}
            onChange={(e) =>
              set('timeLimitMinutes', e.target.value ? Number(e.target.value) : null)
            }
          />
        </Field>
        <Field id="attempts" label="Attempts allowed">
          <Input
            id="attempts"
            type="number"
            min={1}
            max={20}
            value={s.maxAttempts}
            onChange={(e) => set('maxAttempts', Number(e.target.value))}
          />
        </Field>
        <Field id="opens" label="Opens (optional)">
          <Input
            id="opens"
            type="datetime-local"
            value={localInput(s.opensAt)}
            onChange={(e) =>
              set('opensAt', e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </Field>
        <Field id="closes" label="Closes (optional)">
          <Input
            id="closes"
            type="datetime-local"
            value={localInput(s.closesAt)}
            onChange={(e) =>
              set('closesAt', e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        </Field>
        <Field id="show" label="Show people their score">
          <Select
            id="show"
            value={s.showResults}
            onChange={(e) => set('showResults', e.target.value as ResultsVisibility)}
          >
            <option value="AFTER_SUBMIT">As soon as it’s marked</option>
            <option value="AFTER_CLOSE">After the assessment closes</option>
            <option value="NEVER">Never (HR only)</option>
          </Select>
        </Field>
      </div>
      <ToggleRow
        title="Shuffle the question order"
        caption="Each person sees the questions in a different order"
        checked={s.shuffle}
        onCheckedChange={(v) => set('shuffle', v)}
      />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            onSave({
              title: s.title,
              description: s.description,
              purpose: s.purpose,
              passPercent: s.passPercent,
              timeLimitMinutes: s.timeLimitMinutes,
              maxAttempts: s.maxAttempts,
              opensAt: s.opensAt,
              closesAt: s.closesAt,
              showResults: s.showResults,
              shuffle: s.shuffle,
            })
          }
        >
          <Save /> Save settings
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </Card>
  );
}

function QuestionCard({
  n,
  q,
  locked,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  n: number;
  q: Question;
  locked: boolean;
  first: boolean;
  last: boolean;
  onChange: (p: Partial<Question>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const choice = q.kind === 'SINGLE' || q.kind === 'MULTIPLE' || q.kind === 'TRUE_FALSE';
  const right = Array.isArray(q.answer) ? q.answer : [];
  const num = q.answer && !Array.isArray(q.answer) ? q.answer : { value: 0, tolerance: 0 };
  return (
    <Card className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="font-bold">Q{n}</span>
        <Badge tone="info">{KIND_NAME[q.kind]}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <label className="mr-2 flex items-center gap-1.5 text-[13px]">
            Points
            <Input
              type="number"
              min={0}
              max={100}
              value={q.points}
              disabled={locked}
              onChange={(e) => onChange({ points: Number(e.target.value) })}
              className="h-8 w-16"
            />
          </label>
          {!locked && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={first}
                onClick={() => onMove(-1)}
                aria-label="Move up"
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={last}
                onClick={() => onMove(1)}
                aria-label="Move down"
              >
                <ArrowDown />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onRemove}
                aria-label="Remove question"
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>
      <textarea
        rows={2}
        value={q.prompt}
        disabled={locked}
        placeholder="Write the question"
        onChange={(e) => onChange({ prompt: e.target.value })}
        className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
        aria-label={`Question ${n}`}
      />
      {choice && (
        <ul className="grid gap-2">
          {q.options.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <input
                type={q.kind === 'MULTIPLE' ? 'checkbox' : 'radio'}
                name={`q${n}`}
                checked={right.includes(o.id)}
                disabled={locked}
                aria-label="Right answer"
                className="size-4 accent-primary"
                onChange={(e) =>
                  onChange({
                    answer:
                      q.kind === 'MULTIPLE'
                        ? e.target.checked
                          ? [...right, o.id]
                          : right.filter((x) => x !== o.id)
                        : [o.id],
                  })
                }
              />
              <Input
                value={o.text}
                disabled={locked || q.kind === 'TRUE_FALSE'}
                placeholder="Choice"
                onChange={(e) =>
                  onChange({
                    options: q.options.map((x) =>
                      x.id === o.id ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
              {q.kind !== 'TRUE_FALSE' && !locked && q.options.length > 2 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove choice"
                  onClick={() =>
                    onChange({
                      options: q.options.filter((x) => x.id !== o.id),
                      answer: right.filter((x) => x !== o.id),
                    })
                  }
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
          {q.kind !== 'TRUE_FALSE' && !locked && q.options.length < 12 && (
            <li>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({ options: [...q.options, { id: nextOptionId(q.options), text: '' }] })
                }
              >
                <Plus /> Add a choice
              </Button>
            </li>
          )}
          <li className="text-xs text-muted-foreground">
            Tick the right {q.kind === 'MULTIPLE' ? 'choices' : 'choice'}.
          </li>
        </ul>
      )}
      {q.kind === 'NUMBER' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`n${n}`} label="Right answer">
            <Input
              id={`n${n}`}
              type="number"
              step="any"
              value={num.value}
              disabled={locked}
              onChange={(e) => onChange({ answer: { ...num, value: Number(e.target.value) } })}
            />
          </Field>
          <Field id={`t${n}`} label="Allowed difference (±)">
            <Input
              id={`t${n}`}
              type="number"
              step="any"
              min={0}
              value={num.tolerance}
              disabled={locked}
              onChange={(e) => onChange({ answer: { ...num, tolerance: Number(e.target.value) } })}
            />
          </Field>
        </div>
      )}
      {q.kind === 'SHORT' && (
        <Field id={`s${n}`} label="Accepted answers, one per line (leave empty to mark by hand)">
          <textarea
            id={`s${n}`}
            rows={2}
            value={right.join('\n')}
            disabled={locked}
            onChange={(e) =>
              onChange({ answer: e.target.value.split('\n').filter((x) => x.trim()) })
            }
            className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
          />
        </Field>
      )}
      <Input
        value={q.explanation}
        disabled={locked}
        placeholder="Explanation shown with the results (optional)"
        onChange={(e) => onChange({ explanation: e.target.value })}
      />
    </Card>
  );
}

function AssignDialog({
  open,
  id,
  onClose,
  onDone,
}: {
  open: boolean;
  id: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [who, setWho] = useState<'everyone' | 'department' | 'people'>('people');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<
    { id: string; firstName: string; lastName: string; employeeCode: string }[]
  >([]);
  const [dept, setDept] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPicked([]);
    void api<{ id: string; name: string }[]>('/org/departments').then(setDepartments);
    void api<{ items: typeof people }>('/employees?pageSize=100&status=ACTIVE').then((r) =>
      setPeople(r.items),
    );
  }, [open]);

  async function submit() {
    setError('');
    try {
      const r = await api<{ assigned: number; alreadyAssigned: number }>(
        `/assessments/${id}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({
            everyone: who === 'everyone',
            ...(who === 'department' && dept ? { departmentId: dept } : {}),
            employeeIds: who === 'people' ? picked : [],
            ...(due ? { dueAt: new Date(`${due}T23:59:59`).toISOString() } : {}),
          }),
        },
      );
      onDone(
        `Assigned to ${r.assigned} ${r.assigned === 1 ? 'person' : 'people'}${r.alreadyAssigned ? ` (${r.alreadyAssigned} already had it)` : ''}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent side="right" title="Assign people">
          <div className="grid gap-4">
            <DialogDescription className="text-[13.5px] text-muted-foreground">
              They’ll see it under Assessments.
            </DialogDescription>
            <Field id="who" label="Who">
              <Select id="who" value={who} onChange={(e) => setWho(e.target.value as typeof who)}>
                <option value="people">Pick people</option>
                <option value="department">A department</option>
                <option value="everyone">Everyone</option>
              </Select>
            </Field>
            {who === 'department' && (
              <Field id="dept" label="Department">
                <Select id="dept" value={dept} onChange={(e) => setDept(e.target.value)}>
                  <option value="">Choose…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {who === 'people' && (
              <fieldset className="grid max-h-72 gap-2 overflow-auto">
                {people.map((p) => (
                  <Checkbox
                    key={p.id}
                    label={`${p.firstName} ${p.lastName} · ${p.employeeCode}`}
                    checked={picked.includes(p.id)}
                    onChange={(e) =>
                      setPicked((x) =>
                        e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id),
                      )
                    }
                  />
                ))}
              </fieldset>
            )}
            <Field id="due" label="Due date (optional)">
              <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <FormError>{error}</FormError>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => void submit()}>
                <UserPlus /> Assign
              </Button>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
