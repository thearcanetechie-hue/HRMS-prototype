import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';

export type ReportKpi = {
  label: string;
  value: string;
  delta: string;
  tone?: Tone;
  deltaTone?: Tone;
  icon: 'trend' | 'exit' | 'clock' | 'alert';
};

export type ReportChart =
  | {
      kind: 'bars';
      title: string;
      caption: string;
      labels: string[];
      values: number[];
      highlight?: number;
    }
  | {
      kind: 'ranked';
      title: string;
      caption: string;
      rows: { label: string; value: number; tone?: Tone }[];
    };

export type Report = {
  title: string;
  period: string;
  sources: string;
  kpis: ReportKpi[];
  charts: ReportChart[];
  insights: { icon: 'trend' | 'wallet' | 'users' | 'message'; tone: Tone; text: string }[];
};

export type SavedReport = { name: string; schedule: string };

const attrition: Report = {
  title: 'Attrition report',
  period: 'Nov 2025 – Oct 2026',
  sources: 'Built from 142 employee records, 14 exits and 104 survey replies',
  kpis: [
    { label: 'Attrition rate', value: '10.9%', delta: '-2.1 pts', icon: 'trend' },
    {
      label: 'Exits',
      value: '14',
      delta: '9 voluntary',
      tone: 'warning',
      deltaTone: 'warning',
      icon: 'exit',
    },
    { label: 'Avg tenure at exit', value: '1.8 yrs', delta: '+0.3', tone: 'info', icon: 'clock' },
    {
      label: 'Regretted exits',
      value: '4',
      delta: 'High performers',
      tone: 'danger',
      deltaTone: 'danger',
      icon: 'alert',
    },
  ],
  charts: [
    {
      kind: 'bars',
      title: 'Exits by month',
      caption: 'Voluntary and involuntary',
      labels: ['N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O'],
      values: [1, 0, 2, 1, 1, 3, 2, 0, 1, 2, 1, 0],
      highlight: 5,
    },
    {
      kind: 'ranked',
      title: 'Attrition by team',
      caption: 'Rate over 12 months',
      rows: [
        { label: 'Sales', value: 18.2, tone: 'danger' },
        { label: 'Operations', value: 12.5, tone: 'warning' },
        { label: 'Engineering', value: 9.3 },
        { label: 'Finance', value: 8.0 },
        { label: 'Design', value: 6.7 },
        { label: 'People', value: 0 },
      ],
    },
  ],
  insights: [
    {
      icon: 'trend',
      tone: 'danger',
      text: 'Sales loses people 2× faster than the company average. 5 of 6 Sales exits were in their first 18 months.',
    },
    {
      icon: 'wallet',
      tone: 'warning',
      text: 'People who left were paid 11% below the median for their level, based on October salary bands.',
    },
    {
      icon: 'users',
      tone: 'info',
      text: 'Exits fell after the manager training in April: 1.4 a month before, 0.9 a month after.',
    },
    {
      icon: 'message',
      tone: 'success',
      text: 'Exit interviews most often mention growth (6), pay (5) and travel load (3).',
    },
  ],
};

export const SUGGESTIONS = [
  'Overtime cost by month',
  'Leave taken vs balance',
  'Gender pay gap by level',
  'New joiner 90-day retention',
];

export const savedReports: SavedReport[] = [
  { name: 'Monthly headcount', schedule: 'Every 1st · emailed to leadership' },
  { name: 'Payroll cost by team', schedule: 'Every payroll run' },
  { name: 'Absenteeism heatmap', schedule: 'Weekly · Monday 9:00' },
  { name: 'Diversity snapshot', schedule: 'Quarterly · board pack' },
  { name: 'Overtime vs budget', schedule: 'Monthly · finance' },
];

/**
 * Turns a question into a report. For now every question about exits or attrition returns
 * the sample attrition report, and anything else can't be answered yet.
 */
export async function buildReport(question: string): Promise<Report | null> {
  await demoDelay(null, 1200);
  return /attrition|exit|leav(ers|ing)|turnover|retention|resign/i.test(question)
    ? structuredClone(attrition)
    : null;
}
