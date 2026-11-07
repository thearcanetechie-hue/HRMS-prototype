'use client';

import type { ReportKey, ReportRange } from '@hrms/shared';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  Info,
  Loader2,
  LogOut,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BarChart } from '@/components/ui/bar-chart';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Banner, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TONE_TEXT, type Tone } from '@/components/ui/tone';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type KpiIcon = 'users' | 'trend' | 'exit' | 'clock' | 'alert' | 'wallet' | 'calendar' | 'check';
interface Report {
  key: ReportKey;
  title: string;
  period: string;
  sources: string;
  kpis: {
    label: string;
    value: string;
    delta?: string;
    tone?: Tone;
    deltaTone?: Tone;
    icon: KpiIcon;
  }[];
  bars: { title: string; caption: string; unit: string; labels: string[]; values: number[] };
  ranked: {
    title: string;
    caption: string;
    unit: string;
    rows: { label: string; value: number; tone?: Tone }[];
  };
  insights: { tone: Tone; text: string }[];
}
interface Saved {
  id: string;
  name: string;
  reportKey: ReportKey;
  range: ReportRange;
}

const KPI_ICON: Record<KpiIcon, LucideIcon> = {
  users: Users,
  trend: TrendingUp,
  exit: LogOut,
  clock: Clock,
  alert: AlertTriangle,
  wallet: Wallet,
  calendar: CalendarDays,
  check: CheckCircle2,
};
const INSIGHT_ICON: Record<Tone, LucideIcon> = {
  primary: Info,
  info: Info,
  detail: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};
const REPORT_NAMES: Record<ReportKey, string> = {
  headcount: 'Headcount',
  attrition: 'Attrition',
  leave: 'Leave',
  attendance: 'Attendance',
  overtime: 'Overtime',
  claims: 'Expense claims',
  payroll: 'Payroll cost',
  diversity: 'Gender diversity',
  learning: 'Learning',
};
const RANGE_NAMES: Record<ReportRange, string> = {
  '12m': 'Last 12 months',
  q: 'Last 3 months',
  fy: 'Financial year to date',
};

/** Rupee and plain figures for chart labels; percentages keep one decimal. */
function formatValue(v: number, unit: string) {
  if (unit === '₹')
    return v >= 1_00_000
      ? `₹${(v / 1_00_000).toFixed(1)}L`
      : `₹${Math.round(v).toLocaleString('en-IN')}`;
  if (unit === '%') return `${v.toFixed(1)}%`;
  return v.toLocaleString('en-IN');
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** The whole report as a CSV: headline numbers, both tables and the notes. */
function downloadCsv(r: Report) {
  const lines = [
    [r.title, r.period],
    [r.sources],
    [],
    ['Measure', 'Value', 'Note'],
    ...r.kpis.map((k) => [k.label, k.value, k.delta ?? '']),
    [],
    [r.bars.title, r.bars.unit],
    ...r.bars.labels.map((l, i) => [l, r.bars.values[i] ?? 0]),
    [],
    [r.ranked.title, r.ranked.unit],
    ...r.ranked.rows.map((row) => [row.label, row.value]),
    [],
    ['Notes'],
    ...r.insights.map((s) => [s.text]),
  ];
  const blob = new Blob([`﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${r.key}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AnalyticsPage() {
  const [keys, setKeys] = useState<ReportKey[]>([]);
  const [current, setCurrent] = useState<ReportKey>('headcount');
  const [range, setRange] = useState<ReportRange>('12m');
  const [question, setQuestion] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');
  const [notice, setNotice] = useState('');
  const [showData, setShowData] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [asking, setAsking] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async (key: ReportKey, r: ReportRange) => {
    setState('loading');
    try {
      setReport(await api<Report>(`/analytics/reports/${key}?range=${r}`));
      setCurrent(key);
      setRange(r);
      setState('idle');
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Could not build that report.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void api<{ keys: ReportKey[] }>('/analytics/reports').then((r) => setKeys(r.keys));
    void api<Saved[]>('/analytics/saved').then(setSaved);
    void load('headcount', '12m');
  }, [load]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (question.trim().length < 2) return;
    setAsking(true);
    setNotice('');
    try {
      const res = await api<{ matched: ReportKey | null; report: Report | null }>(
        '/analytics/ask',
        { method: 'POST', body: JSON.stringify({ question, range }) },
      );
      if (res.report && res.matched) {
        setReport(res.report);
        setCurrent(res.matched);
      } else
        setNotice(
          `I don't have a report for that yet. Pick one of the reports above: ${keys.map((k) => REPORT_NAMES[k].toLowerCase()).join(', ')}.`,
        );
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Could not build that report.');
    }
    setAsking(false);
  }

  async function save() {
    if (!report) return;
    const name = `${REPORT_NAMES[current]} · ${RANGE_NAMES[range]}`;
    try {
      const row = await api<Saved>('/analytics/saved', {
        method: 'POST',
        body: JSON.stringify({ name, reportKey: current, range }),
      });
      setSaved((s) => [row, ...s]);
      showToast('Saved');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save');
    }
  }

  async function remove(id: string) {
    await api(`/analytics/saved/${id}`, { method: 'DELETE' }).catch(() => null);
    setSaved((s) => s.filter((x) => x.id !== id));
  }

  const topRank = report ? Math.max(1, ...report.ranked.rows.map((r) => r.value)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics & reporting"
        description="Reports built live from your own records. Ask a question or pick a report."
        actions={
          <>
            <Button onClick={save} disabled={!report || state !== 'idle'}>
              <Bookmark /> Save report
            </Button>
            <Button
              variant="primary"
              disabled={!report || state !== 'idle'}
              onClick={() => report && downloadCsv(report)}
            >
              <Download /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-5">
        <Card className="grid gap-4">
          <form
            onSubmit={ask}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-2 pl-4 shadow-inset-sm sm:flex-nowrap"
          >
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Ask a question about your people data"
              placeholder="Ask about headcount, attrition, leave, overtime, claims…"
              className="h-11 min-w-0 grow bg-transparent outline-none placeholder:text-muted-foreground/80"
            />
            <Button variant="primary" type="submit" disabled={asking}>
              {asking ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Build report
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">Reports:</span>
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === current}
                onClick={() => void load(k, range)}
                className={cn(
                  'h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold shadow-raised-sm',
                  k === current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface text-muted-foreground hover:text-foreground',
                )}
              >
                {REPORT_NAMES[k]}
              </button>
            ))}
          </div>
        </Card>

        {notice && <Banner className="mb-0">{notice}</Banner>}

        {state === 'loading' ? (
          <div className="grid gap-5" aria-busy="true">
            <p className="text-muted-foreground">Building your report…</p>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        ) : (
          report && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl">
                    {report.title} · {report.period}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">{report.sources}</p>
                </div>
                <Tabs value={range} onValueChange={(v) => void load(current, v as ReportRange)}>
                  <TabsList>
                    <TabsTrigger value="12m">12 months</TabsTrigger>
                    <TabsTrigger value="q">Quarter</TabsTrigger>
                    <TabsTrigger value="fy">FY to date</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                {report.kpis.map((k) => {
                  const Icon = KPI_ICON[k.icon];
                  return (
                    <StatCard
                      key={k.label}
                      icon={<Icon />}
                      tone={k.tone}
                      value={k.value}
                      label={k.label}
                      delta={k.delta}
                      deltaTone={k.deltaTone}
                    />
                  );
                })}
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <Card className="min-w-0">
                  <CardHeader>
                    <div>
                      <CardTitle>{report.bars.title}</CardTitle>
                      <CardDescription>{report.bars.caption}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowData((s) => !s)}>
                      {showData ? <EyeOff /> : <Eye />} {showData ? 'Show chart' : 'Show data'}
                    </Button>
                  </CardHeader>
                  {showData ? (
                    <Table bare>
                      <THead>
                        <tr>
                          <TH>Month</TH>
                          <TH className="text-right">{report.bars.unit}</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {report.bars.labels.map((l, i) => (
                          <TR key={l}>
                            <TD>{l}</TD>
                            <TD className="text-right font-mono">
                              {formatValue(report.bars.values[i] ?? 0, report.bars.unit)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                    <BarChart
                      label={report.bars.title}
                      height={200}
                      highlight={String(report.bars.labels.length - 1)}
                      format={(v) => formatValue(v, report.bars.unit)}
                      data={report.bars.labels.map((l, i) => ({
                        key: String(i),
                        label: l.slice(0, 3),
                        value: report.bars.values[i] ?? 0,
                      }))}
                    />
                  )}
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>{report.ranked.title}</CardTitle>
                      <CardDescription>{report.ranked.caption}</CardDescription>
                    </div>
                  </CardHeader>
                  {report.ranked.rows.length ? (
                    <ul className="grid gap-3.5">
                      {report.ranked.rows.map((r) => (
                        <li key={r.label} className="grid gap-1.5">
                          <div className="flex justify-between gap-2">
                            <span className="font-semibold">{r.label}</span>
                            <span
                              className={cn(
                                'font-mono text-[13px]',
                                r.tone ? TONE_TEXT[r.tone] : 'text-muted-foreground',
                              )}
                            >
                              {formatValue(r.value, report.ranked.unit)}
                            </span>
                          </div>
                          <ProgressBar
                            value={(r.value / topRank) * 100}
                            tone={r.tone ?? 'primary'}
                            label={r.label}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Nothing to show for this period yet.</p>
                  )}
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>What the data says</CardTitle>
                      <CardDescription>Worked out from the numbers above</CardDescription>
                    </div>
                  </CardHeader>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {report.insights.map((s) => {
                      const Icon = INSIGHT_ICON[s.tone];
                      return (
                        <li
                          key={s.text}
                          className="flex gap-3 rounded-[14px] bg-surface-2/70 p-4 leading-relaxed"
                        >
                          <IconTile tone={s.tone} size={36}>
                            <Icon />
                          </IconTile>
                          <span>{s.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Saved reports</CardTitle>
                      <CardDescription>
                        {saved.length ? `${saved.length} saved` : 'Save a report to reopen it here'}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <ul className="grid gap-1">
                    {saved.map((r) => (
                      <li key={r.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="flex min-w-0 grow cursor-pointer items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2/60"
                          onClick={() => void load(r.reportKey, r.range)}
                        >
                          <IconTile size={36}>
                            <BarChart3 />
                          </IconTile>
                          <div className="min-w-0 grow">
                            <div className="truncate font-semibold">{r.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {RANGE_NAMES[r.range]}
                            </div>
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${r.name}`}
                          onClick={() => void remove(r.id)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )
        )}
      </div>
      <Toast message={toast} />
    </>
  );
}
