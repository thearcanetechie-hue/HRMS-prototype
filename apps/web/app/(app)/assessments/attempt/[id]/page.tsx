'use client';

import type { QuestionKind } from '@hrms/shared';
import { CheckCircle2, Clock, Loader2, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, Input } from '@/components/ui/input';
import { Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { api, ApiError } from '@/lib/api';
import { duration, type Option } from '@/lib/assessments';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type Given = string[] | string | number | null;
interface AttemptQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: Option[];
  points: number;
  given: Given;
  answer?: string[] | { value: number; tolerance: number } | null;
  explanation?: string;
  awarded?: string | null;
  feedback?: string;
  needsMarking?: boolean;
}
interface Attempt {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'MARKED';
  expiresAt: string | null;
  submittedAt: string | null;
  employee: { id: string; firstName: string; lastName: string };
  assessment: { id: string; title: string; description: string; passPercent: number };
  maxScore: number;
  score: string | null;
  percent: string | null;
  passed: boolean | null;
  questions: AttemptQuestion[];
}

export default function AttemptPage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const [t, setT] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, Given>>({});
  const [marks, setMarks] = useState<Record<string, { points: string; feedback: string }>>({});
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(0);
  const [toast, showToast] = useToast();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    try {
      const a = await api<Attempt>(`/assessments/attempts/${id}`);
      setT(a);
      setAnswers(Object.fromEntries(a.questions.map((q) => [q.id, q.given])));
      setMarks(
        Object.fromEntries(
          a.questions.map((q) => [
            q.id,
            {
              points: q.awarded == null ? '' : String(Number(q.awarded)),
              feedback: q.feedback ?? '',
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this attempt.');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const taking = t?.status === 'IN_PROGRESS';
  useEffect(() => {
    if (!taking) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [taking]);
  const left = t?.expiresAt ? Date.parse(t.expiresAt) - now : null;
  // When the clock runs out, the server has already submitted it: reload to show that.
  useEffect(() => {
    if (taking && left !== null && left <= 0) void load();
  }, [taking, left, load]);

  /** Saves each answer a moment after the last change, so typing doesn't send every key. */
  function answer(qid: string, value: Given) {
    setAnswers((a) => ({ ...a, [qid]: value }));
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(() => {
      setSaving((n) => n + 1);
      api(`/assessments/attempts/${id}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: qid, answer: value ?? '' }),
      })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not save'))
        .finally(() => setSaving((n) => n - 1));
    }, 500);
  }

  async function submit() {
    const blank = t!.questions.filter((q) => {
      const v = answers[q.id];
      return v == null || v === '' || (Array.isArray(v) && !v.length);
    }).length;
    if (
      !confirm(
        blank
          ? `${blank} question${blank > 1 ? 's are' : ' is'} unanswered. Submit anyway?`
          : 'Submit your answers?',
      )
    )
      return;
    setBusy(true);
    // Let pending saves land first.
    await Promise.all(
      Object.entries(timers.current).map(async ([qid, h]) => {
        clearTimeout(h);
        await api(`/assessments/attempts/${id}/answers`, {
          method: 'PUT',
          body: JSON.stringify({ questionId: qid, answer: answers[qid] ?? '' }),
        }).catch(() => null);
      }),
    );
    timers.current = {};
    try {
      await api(`/assessments/attempts/${id}/submit`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit');
      await load();
    }
    setBusy(false);
  }

  async function saveMarks() {
    setBusy(true);
    setError('');
    try {
      await api(`/assessments/attempts/${id}/mark`, {
        method: 'POST',
        body: JSON.stringify({
          marks: Object.entries(marks)
            .filter(([, m]) => m.points !== '')
            .map(([questionId, m]) => ({
              questionId,
              points: Number(m.points),
              feedback: m.feedback,
            })),
        }),
      });
      showToast('Marks saved');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save marks');
    }
    setBusy(false);
  }

  if (error && !t)
    return (
      <Card>
        <Empty>{error}</Empty>
      </Card>
    );
  if (!t) return <Skeleton className="h-96 rounded-2xl" />;

  const own = me?.employee?.id === t.employee.id;
  const marking = can('assessment.manage') && t.status !== 'IN_PROGRESS';
  const reviewed = t.questions.some((q) => 'answer' in q);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={marking && !own ? `/assessments/${t.assessment.id}` : '/assessments'}
            className="hover:underline"
          >
            Assessments
          </Link>
        }
        title={t.assessment.title}
        description={
          own
            ? t.assessment.description
            : `${t.employee.firstName} ${t.employee.lastName}’s answers`
        }
        actions={
          taking ? (
            <div className="flex items-center gap-3">
              {left !== null && (
                <Badge tone={left < 60_000 ? 'danger' : left < 300_000 ? 'warning' : 'info'}>
                  <Clock className="size-3.5" /> {duration(left)} left
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {saving ? 'Saving…' : 'All answers saved'}
              </span>
              <Button variant="primary" disabled={busy} onClick={() => void submit()}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Submit
              </Button>
            </div>
          ) : undefined
        }
      />

      {!taking && (
        <Card className="mb-5 flex flex-wrap items-center gap-4">
          {t.percent !== null ? (
            <>
              {t.passed ? (
                <CheckCircle2 className="size-8 text-success" />
              ) : (
                <XCircle className="size-8 text-danger" />
              )}
              <div>
                <div className="text-2xl font-extrabold">{Number(t.percent)}%</div>
                <div className="text-[13px] text-muted-foreground">
                  {Number(t.score)} of {t.maxScore} points · {t.passed ? 'passed' : 'not passed'}{' '}
                  (pass mark {t.assessment.passPercent}%)
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t.status === 'SUBMITTED'
                ? 'Submitted. Some answers are being marked by hand; the score appears once that’s done.'
                : 'Submitted. Your score will be shared later.'}
            </p>
          )}
        </Card>
      )}
      {error && <FormError>{error}</FormError>}

      <ol className="grid gap-4">
        {t.questions.map((q, i) => (
          <li key={q.id}>
            <Card className="grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold whitespace-pre-wrap">
                  {i + 1}. {q.prompt}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {q.awarded != null ? `${Number(q.awarded)} / ` : ''}
                  {q.points} pt{q.points === 1 ? '' : 's'}
                </span>
              </div>
              <AnswerInput
                q={q}
                value={answers[q.id] ?? null}
                disabled={!taking}
                onChange={(v) => answer(q.id, v)}
              />
              {reviewed && <Review q={q} />}
              {marking && (q.needsMarking || q.kind === 'LONG' || q.kind === 'SHORT') && (
                <div className="grid gap-2 rounded-xl bg-surface-2/60 p-3 sm:grid-cols-[120px_1fr]">
                  <Input
                    type="number"
                    min={0}
                    max={q.points}
                    step="0.5"
                    placeholder={`0–${q.points}`}
                    aria-label="Points"
                    value={marks[q.id]?.points ?? ''}
                    onChange={(e) =>
                      setMarks((m) => ({ ...m, [q.id]: { ...m[q.id]!, points: e.target.value } }))
                    }
                  />
                  <Input
                    placeholder="Feedback (optional)"
                    aria-label="Feedback"
                    value={marks[q.id]?.feedback ?? ''}
                    onChange={(e) =>
                      setMarks((m) => ({ ...m, [q.id]: { ...m[q.id]!, feedback: e.target.value } }))
                    }
                  />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {taking && (
        <div className="mt-5 flex justify-end">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void submit()}>
            <Send /> Submit answers
          </Button>
        </div>
      )}
      {marking && (
        <div className="sticky bottom-4 mt-5 flex justify-end">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void saveMarks()}>
            Save marks
          </Button>
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}

function AnswerInput({
  q,
  value,
  disabled,
  onChange,
}: {
  q: AttemptQuestion;
  value: Given;
  disabled: boolean;
  onChange: (v: Given) => void;
}) {
  if (q.kind === 'SINGLE' || q.kind === 'TRUE_FALSE' || q.kind === 'MULTIPLE') {
    const picked = Array.isArray(value) ? value : value ? [String(value)] : [];
    const right = Array.isArray(q.answer) ? q.answer : [];
    return (
      <ul className="grid gap-2">
        {q.options.map((o) => (
          <li key={o.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5',
                q.answer && right.includes(o.id) && 'outline-2 outline-success/60',
                disabled && 'cursor-default',
              )}
            >
              <input
                type={q.kind === 'MULTIPLE' ? 'checkbox' : 'radio'}
                name={q.id}
                className="size-4 accent-primary"
                checked={picked.includes(o.id)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    q.kind === 'MULTIPLE'
                      ? e.target.checked
                        ? [...picked, o.id]
                        : picked.filter((x) => x !== o.id)
                      : [o.id],
                  )
                }
              />
              {o.text}
            </label>
          </li>
        ))}
      </ul>
    );
  }
  if (q.kind === 'LONG')
    return (
      <textarea
        rows={5}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Your answer"
        className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
      />
    );
  return (
    <Input
      type={q.kind === 'NUMBER' ? 'number' : 'text'}
      step="any"
      value={value == null ? '' : String(value)}
      disabled={disabled}
      aria-label="Your answer"
      onChange={(e) =>
        onChange(
          q.kind === 'NUMBER' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}

function Review({ q }: { q: AttemptQuestion }) {
  const right =
    q.answer == null
      ? null
      : Array.isArray(q.answer)
        ? q.kind === 'SHORT'
          ? q.answer.join(' / ')
          : null
        : `${q.answer.value}${q.answer.tolerance ? ` (± ${q.answer.tolerance})` : ''}`;
  if (!right && !q.explanation && !q.feedback && !q.needsMarking) return null;
  return (
    <div className="grid gap-1 text-[13px]">
      {q.needsMarking && <Badge tone="warning">Waiting to be marked</Badge>}
      {right && (
        <p>
          <span className="font-semibold">Right answer:</span> {right}
        </p>
      )}
      {q.explanation && <p className="text-muted-foreground">{q.explanation}</p>}
      {q.feedback && (
        <p>
          <span className="font-semibold">Feedback:</span> {q.feedback}
        </p>
      )}
    </div>
  );
}
