'use client';

import { ClipboardCheck, Clock, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, IconTile, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import {
  type AssessmentStatus,
  PURPOSE_NAME,
  type Purpose,
  STATUS_NAME,
  STATUS_TONE,
} from '@/lib/assessments';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';

interface MineItem {
  id: string;
  title: string;
  description: string;
  purpose: Purpose;
  status: AssessmentStatus;
  timeLimitMinutes: number | null;
  passPercent: number;
  maxAttempts: number;
  closesAt: string | null;
  dueAt: string | null;
  questions: number;
  attemptsUsed: number;
  inProgress: string | null;
  canStart: boolean;
  attempts: {
    id: string;
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'MARKED';
    percent: string | null;
    passed: boolean | null;
  }[];
}
interface ListItem {
  id: string;
  title: string;
  purpose: Purpose;
  status: AssessmentStatus;
  questions: number;
  assigned: number;
  completed: number;
  passed: number;
  toMark: number;
  createdAt: string;
}

export default function AssessmentsPage() {
  const { can } = useSession();
  const manage = can('assessment.manage');
  const router = useRouter();
  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState<MineItem[] | null>(null);
  const [all, setAll] = useState<ListItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    void api<MineItem[]>('/assessments/mine').then(setMine);
    if (manage) {
      void api<ListItem[]>('/assessments').then(setAll);
      setTab('all');
    }
  }, [manage]);

  async function create() {
    setBusy('new');
    try {
      const a = await api<{ id: string }>('/assessments', {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled assessment' }),
      });
      router.push(`/assessments/${a.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not create it');
      setBusy(null);
    }
  }

  async function start(item: MineItem) {
    if (item.inProgress) return router.push(`/assessments/attempt/${item.inProgress}`);
    setBusy(item.id);
    try {
      const t = await api<{ id: string }>(`/assessments/${item.id}/attempts`, { method: 'POST' });
      router.push(`/assessments/attempt/${t.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not start');
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Assessments"
        description="Tests and quizzes for training, hiring, reviews and compliance."
        actions={
          manage && (
            <Button variant="primary" onClick={() => void create()} disabled={busy === 'new'}>
              {busy === 'new' ? <Loader2 className="animate-spin" /> : <Plus />} New assessment
            </Button>
          )
        }
      />

      {manage && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="all">All assessments</TabsTrigger>
            <TabsTrigger value="mine">Assigned to me</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {tab === 'all' && manage ? (
        <Card>
          {!all ? (
            <Skeleton className="h-60 rounded-2xl" />
          ) : all.length ? (
            <Table bare>
              <THead>
                <tr>
                  <TH>Assessment</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Questions</TH>
                  <TH className="text-right">Assigned</TH>
                  <TH className="text-right">Done</TH>
                  <TH className="text-right">Passed</TH>
                  <TH className="text-right">To mark</TH>
                </tr>
              </THead>
              <TBody>
                {all.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/assessments/${a.id}`} className="font-semibold hover:underline">
                        {a.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {PURPOSE_NAME[a.purpose]} · made {formatDate(a.createdAt)}
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={STATUS_TONE[a.status]}>{STATUS_NAME[a.status]}</Badge>
                    </TD>
                    <TD className="text-right font-mono">{a.questions}</TD>
                    <TD className="text-right font-mono">{a.assigned}</TD>
                    <TD className="text-right font-mono">{a.completed}</TD>
                    <TD className="text-right font-mono">{a.passed}</TD>
                    <TD className="text-right font-mono">
                      {a.toMark ? <Badge tone="warning">{a.toMark}</Badge> : '–'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty>No assessments yet. Make one with “New assessment”.</Empty>
          )}
        </Card>
      ) : !mine ? (
        <Skeleton className="h-60 rounded-2xl" />
      ) : mine.length ? (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {mine.map((m) => {
            const last = m.attempts.find((t) => t.status !== 'IN_PROGRESS');
            return (
              <li key={m.id}>
                <Card className="grid h-full content-start gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <IconTile>
                      <ClipboardCheck />
                    </IconTile>
                    {last?.status === 'MARKED' && last.passed !== null ? (
                      <Badge tone={last.passed ? 'success' : 'danger'}>
                        {last.passed ? 'Passed' : 'Not passed'} · {Number(last.percent)}%
                      </Badge>
                    ) : last ? (
                      <Badge tone="info">
                        {last.status === 'SUBMITTED' ? 'Being marked' : 'Submitted'}
                      </Badge>
                    ) : m.inProgress ? (
                      <Badge tone="warning">In progress</Badge>
                    ) : (
                      <Badge>To do</Badge>
                    )}
                  </div>
                  <div>
                    <CardTitle>{m.title}</CardTitle>
                    <CardDescription>
                      {m.questions} questions · pass mark {m.passPercent}%
                      {m.timeLimitMinutes ? ` · ${m.timeLimitMinutes} min` : ''}
                    </CardDescription>
                  </div>
                  {m.description && (
                    <p className="line-clamp-3 text-[13px] text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {m.dueAt && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" /> Due {formatDate(m.dueAt)}
                      </span>
                    )}
                    <span>
                      {m.attemptsUsed} of {m.maxAttempts} attempt{m.maxAttempts > 1 ? 's' : ''} used
                    </span>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {(m.canStart || m.inProgress) && (
                      <Button
                        variant="primary"
                        onClick={() => void start(m)}
                        disabled={busy === m.id}
                      >
                        {m.inProgress ? 'Carry on' : m.attemptsUsed ? 'Try again' : 'Start'}
                      </Button>
                    )}
                    {last && (
                      <Button asChild>
                        <Link href={`/assessments/attempt/${last.id}`}>See my answers</Link>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <Empty>Nothing to take right now.</Empty>
        </Card>
      )}
      <Toast message={toast} />
    </>
  );
}
