'use client';

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Sparkles,
  TrendingDown,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Banner, DemoBadge, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TONE_TEXT } from '@/components/ui/tone';
import {
  buildReport,
  savedReports,
  SUGGESTIONS,
  type Report,
  type ReportKpi,
} from '@/lib/demo/analytics';
import { cn } from '@/lib/utils';

const KPI_ICON: Record<ReportKpi['icon'], LucideIcon> = {
  trend: TrendingDown,
  exit: LogOut,
  clock: Clock,
  alert: AlertTriangle,
};
const INSIGHT_ICON: Record<Report['insights'][number]['icon'], LucideIcon> = {
  trend: TrendingDown,
  wallet: Wallet,
  users: Users,
  message: MessageSquare,
};
const DEFAULT_Q = 'Show attrition by team for the last 12 months and what drives it';

export default function AnalyticsPage() {
  const [question, setQuestion] = useState(DEFAULT_Q);
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('loading');
  const [range, setRange] = useState('12m');
  const [showData, setShowData] = useState(false);
  const [toast, showToast] = useToast();

  async function run(q: string) {
    setState('loading');
    const r = await buildReport(q);
    if (r) {
      setReport(r);
      setState('idle');
    } else setState('failed');
  }

  useEffect(() => {
    void run(DEFAULT_Q);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (question.trim()) void run(question);
  }

  const bars = report?.charts.find((c) => c.kind === 'bars');
  const ranked = report?.charts.find((c) => c.kind === 'ranked');
  const topRank = ranked?.kind === 'ranked' ? Math.max(...ranked.rows.map((r) => r.value)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Analytics & reporting <DemoBadge />
          </span>
        }
        description="Ask a question about your people data and get a report you can share."
        actions={
          <>
            <Button onClick={() => showToast('Scheduling is coming soon')}>
              <CalendarClock /> Schedule
            </Button>
            <Button
              variant="primary"
              disabled={!report}
              onClick={() => showToast('PDF and Excel export are coming soon')}
            >
              <Download /> Export report
            </Button>
          </>
        }
      />

      <div className="grid gap-5">
        <Card className="grid gap-4">
          <form
            onSubmit={submit}
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-2 pl-4 shadow-inset-sm sm:flex-nowrap"
          >
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Ask a question about your people data"
              placeholder="Ask about attrition, overtime, leave, pay…"
              className="h-11 min-w-0 grow bg-transparent outline-none placeholder:text-muted-foreground/80"
            />
            <Button variant="primary" type="submit" disabled={state === 'loading'}>
              {state === 'loading' ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Build report
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void run(s);
                }}
                className="h-8 cursor-pointer rounded-full bg-surface px-3 text-[13px] font-semibold text-muted-foreground shadow-raised-sm hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>

        {state === 'failed' && (
          <Banner className="mb-0">
            I couldn’t build that report from your data yet. Try one of the suggestions above, or
            ask about attrition and exits.
          </Banner>
        )}

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
                  <p className="text-[13px] text-muted-foreground">
                    {report.sources} · updated just now
                  </p>
                </div>
                <Tabs value={range} onValueChange={setRange}>
                  <TabsList>
                    <TabsTrigger value="12m">12 months</TabsTrigger>
                    <TabsTrigger value="q">Quarter</TabsTrigger>
                    <TabsTrigger value="ytd">YTD</TabsTrigger>
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
                {bars?.kind === 'bars' && (
                  <Card className="min-w-0">
                    <CardHeader>
                      <div>
                        <CardTitle>{bars.title}</CardTitle>
                        <CardDescription>{bars.caption}</CardDescription>
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
                            <TH className="text-right">Exits</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {bars.labels.map((l, i) => (
                            <TR key={i}>
                              <TD>{monthName(i)}</TD>
                              <TD className="text-right font-mono">{bars.values[i]}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    ) : (
                      <BarChart
                        label={bars.title}
                        height={200}
                        highlight={String(bars.highlight)}
                        data={bars.labels.map((l, i) => ({
                          // Month letters repeat (M, J), so each bar is keyed by position.
                          key: String(i),
                          label: l,
                          value: bars.values[i] ?? 0,
                        }))}
                      />
                    )}
                  </Card>
                )}

                {ranked?.kind === 'ranked' && (
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>{ranked.title}</CardTitle>
                        <CardDescription>{ranked.caption}</CardDescription>
                      </div>
                    </CardHeader>
                    <ul className="grid gap-3.5">
                      {ranked.rows.map((r) => (
                        <li key={r.label} className="grid gap-1.5">
                          <div className="flex justify-between gap-2">
                            <span className="font-semibold">{r.label}</span>
                            <span
                              className={cn(
                                'font-mono text-[13px]',
                                r.tone ? TONE_TEXT[r.tone] : 'text-muted-foreground',
                              )}
                            >
                              {r.value.toFixed(1)}%
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
                  </Card>
                )}
              </div>

              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>What the data says</CardTitle>
                      <CardDescription>
                        Written by the report engine · check before sharing
                      </CardDescription>
                    </div>
                    <Badge tone="accent">AI summary</Badge>
                  </CardHeader>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {report.insights.map((s) => {
                      const Icon = INSIGHT_ICON[s.icon];
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
                      <CardDescription>12 reports</CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => showToast('Saved this report')}
                    >
                      <Plus /> New
                    </Button>
                  </CardHeader>
                  <ul className="grid gap-1">
                    {savedReports.map((r) => (
                      <li key={r.name}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2/60"
                          onClick={() => showToast(`${r.name} opens here soon`)}
                        >
                          <IconTile size={36}>
                            <BarChart3 />
                          </IconTile>
                          <div className="min-w-0 grow">
                            <div className="truncate font-semibold">{r.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {r.schedule}
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </button>
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

const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const monthName = (i: number) => MONTHS[i] ?? '';
