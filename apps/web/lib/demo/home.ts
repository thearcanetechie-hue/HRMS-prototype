import { demoDelay } from '@/lib/format';

export type RequestKind = 'leave' | 'overtime' | 'claim' | 'field';

export type HomeSummary = {
  headcount: number;
  joinedThisMonth: number;
  presentToday: number;
  onLeave: number;
  sickToday: number;
  openRequests: number;
  urgentRequests: number;
  attendanceWeek: { label: string; pct: number }[];
  attendanceMonth: { label: string; pct: number }[];
  requests: {
    id: string;
    employee: { initials: string; name: string };
    kind: RequestKind;
    summary: string;
  }[];
  payroll: {
    month: string;
    payDate: string;
    daysLeft: number;
    readyPct: number;
    checks: { label: string; done: number; total: number }[];
  };
  events: {
    kind: 'birthday' | 'anniversary' | 'holiday' | 'joining';
    title: string;
    when: string;
  }[];
  teams: { name: string; count: number }[];
};

const summary: HomeSummary = {
  headcount: 128,
  joinedThisMonth: 4,
  presentToday: 118,
  onLeave: 6,
  sickToday: 2,
  openRequests: 14,
  urgentRequests: 5,
  attendanceWeek: [
    { label: 'Mon 12', pct: 91 },
    { label: 'Tue 13', pct: 94 },
    { label: 'Wed 14', pct: 96 },
    { label: 'Thu 15', pct: 93 },
    { label: 'Fri 16', pct: 95 },
    { label: 'Sat 17', pct: 52 },
    { label: 'Sun 18', pct: 0 },
  ],
  attendanceMonth: [
    { label: 'Jun', pct: 92 },
    { label: 'Jul', pct: 93 },
    { label: 'Aug', pct: 90 },
    { label: 'Sep', pct: 94 },
    { label: 'Oct', pct: 93 },
  ],
  requests: [
    {
      id: 'r1',
      employee: { initials: 'AS', name: 'Ananya Sharma' },
      kind: 'leave',
      summary: 'Sick leave · 20–21 Oct',
    },
    {
      id: 'r2',
      employee: { initials: 'RK', name: 'Ravi Kumar' },
      kind: 'overtime',
      summary: 'Overtime · 6 h on 15 Oct',
    },
    {
      id: 'r3',
      employee: { initials: 'PM', name: 'Priya Menon' },
      kind: 'claim',
      summary: 'Travel claim · ₹ 4,820',
    },
    {
      id: 'r4',
      employee: { initials: 'KS', name: 'Kabir Singh' },
      kind: 'field',
      summary: 'Field visit · Pune client',
    },
  ],
  payroll: {
    month: 'October',
    payDate: '31 Oct',
    daysLeft: 14,
    readyPct: 72,
    checks: [
      { label: 'Attendance locked', done: 128, total: 128 },
      { label: 'Overtime approved', done: 18, total: 21 },
      { label: 'Claims approved', done: 42, total: 47 },
      { label: 'Tax declarations', done: 119, total: 128 },
    ],
  },
  events: [
    { kind: 'birthday', title: 'Neha Gupta turns 27', when: 'Birthday · Tue 20 Oct' },
    { kind: 'anniversary', title: 'Ravi Kumar · 2 years', when: 'Work anniversary · Thu 22 Oct' },
    { kind: 'holiday', title: 'Diwali (Deepavali)', when: 'Company holiday · Sat 7 Nov' },
    { kind: 'joining', title: '3 people join', when: 'Onboarding · Mon 26 Oct' },
  ],
  teams: [
    { name: 'Engineering', count: 54 },
    { name: 'Sales', count: 22 },
    { name: 'Operations', count: 18 },
    { name: 'Design', count: 14 },
    { name: 'Finance', count: 12 },
    { name: 'People', count: 8 },
  ],
};

export const getHomeSummary = () => demoDelay(summary);
