import type { BadgeTone } from '@/components/ui/badge';
import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';

/**
 * Sample figures only. Real payroll calculations must be checked by a chartered accountant
 * before any live run.
 */
export type PayrollRun = {
  month: string;
  payDate: string;
  employees: number;
  step: 1 | 2 | 3 | 4 | 5;
  gross: number;
  net: number;
  statutory: number;
  ctc: number;
};

export type SalaryRow = {
  employeeId: string;
  initials: string;
  name: string;
  team: string;
  gross: number;
  pf: number;
  esi: number | null;
  pt: number;
  tds: number;
  net: number;
  flag?: { reason: string; tag: string; tone: BadgeTone };
};

export type ComplianceItem = {
  name: string;
  due: string;
  day: string;
  month: string;
  dueInDays: number;
  status: 'open' | 'soon' | 'filed';
};

export type PayrollOverview = {
  run: PayrollRun;
  attendanceLocked: boolean;
  salaries: SalaryRow[];
  compliance: ComplianceItem[];
  split: { label: string; amount: number; tone: Tone }[];
};

const overview: PayrollOverview = {
  run: {
    month: 'October 2026',
    payDate: 'Saturday 31 October',
    employees: 128,
    step: 3,
    gross: 11240000,
    net: 8960000,
    statutory: 2200000,
    ctc: 12400000,
  },
  attendanceLocked: true,
  salaries: [
    {
      employeeId: 'e1',
      initials: 'AS',
      name: 'Ananya Sharma',
      team: 'Engineering',
      gross: 154166,
      pf: 1800,
      esi: null,
      pt: 200,
      tds: 18420,
      net: 133746,
    },
    {
      employeeId: 'e2',
      initials: 'RK',
      name: 'Ravi Kumar',
      team: 'Operations',
      gross: 92500,
      pf: 1800,
      esi: null,
      pt: 200,
      tds: 6110,
      net: 84390,
    },
    {
      employeeId: 'e3',
      initials: 'PM',
      name: 'Priya Menon',
      team: 'Finance',
      gross: 68000,
      pf: 1800,
      esi: null,
      pt: 200,
      tds: 2340,
      net: 63660,
      flag: {
        reason: 'Last working day 14 Nov, prorate and hold F&F',
        tag: 'Exit',
        tone: 'danger',
      },
    },
    {
      employeeId: 'e4',
      initials: 'AR',
      name: 'Arjun Reddy',
      team: 'Engineering',
      gross: 105000,
      pf: 1800,
      esi: null,
      pt: 200,
      tds: 8950,
      net: 94050,
      flag: { reason: 'Joined 15 Oct, pay for 17 of 31 days', tag: 'New joiner', tone: 'accent' },
    },
    {
      employeeId: 'e5',
      initials: 'VS',
      name: 'Vinod S.',
      team: 'Operations',
      gross: 19800,
      pf: 1782,
      esi: 149,
      pt: 0,
      tds: 0,
      net: 17869,
      flag: {
        reason: 'Gross under ₹ 21,000, ESI applies from this month',
        tag: 'ESI',
        tone: 'warning',
      },
    },
    {
      employeeId: 'e6',
      initials: 'KS',
      name: 'Kabir Singh',
      team: 'Sales',
      gross: 84000,
      pf: 1800,
      esi: null,
      pt: 200,
      tds: 4860,
      net: 77140,
    },
  ],
  compliance: [
    {
      name: 'TDS · Form 24Q Q2',
      due: '31 Oct',
      day: '31',
      month: 'Oct',
      dueInDays: 14,
      status: 'soon',
    },
    {
      name: 'PF ECR & challan',
      due: '15 Nov',
      day: '15',
      month: 'Nov',
      dueInDays: 29,
      status: 'open',
    },
    {
      name: 'ESI contribution',
      due: '15 Nov',
      day: '15',
      month: 'Nov',
      dueInDays: 29,
      status: 'open',
    },
    {
      name: 'Professional tax (KA)',
      due: '20 Nov',
      day: '20',
      month: 'Nov',
      dueInDays: 34,
      status: 'open',
    },
    {
      name: 'LWF (half-yearly)',
      due: '15 Jan',
      day: '15',
      month: 'Jan',
      dueInDays: 90,
      status: 'open',
    },
    { name: 'Form 16', due: '15 Jun', day: '15', month: 'Jun', dueInDays: 0, status: 'filed' },
  ],
  split: [
    { label: 'Net salaries', amount: 8960000, tone: 'primary' },
    { label: 'Income tax (TDS)', amount: 960000, tone: 'detail' },
    { label: 'Provident fund', amount: 1080000, tone: 'info' },
    { label: 'ESI + PT + LWF', amount: 150000, tone: 'warning' },
    { label: 'Reimbursements', amount: 320000, tone: 'success' },
  ],
};

export const getPayrollOverview = () => demoDelay(structuredClone(overview));
