import { demoDelay } from '@/lib/format';
import type { Person } from './claims';

export type WorkloadRow = { employee: Person; weeks: { start: string; pct: number }[] };

export type Goal = {
  id: string;
  title: string;
  owner: Person;
  due: string;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'done';
};

export type ReviewCycle = {
  name: string;
  closes: string;
  self: number;
  manager: number;
  calibration: number;
  shared: number;
  total: number;
};

export type PerformanceOverview = {
  workload: WorkloadRow[];
  cycle: ReviewCycle | null;
  goals: Goal[];
  goalsTotal: number;
  goalsOnTrack: number;
  recognition: { employee: Person; reason: string; stars: number }[];
};

const WEEKS = ['19 Oct', '26 Oct', '2 Nov', '9 Nov', '16 Nov', '23 Nov'];
const wl = (initials: string, name: string, pcts: number[]): WorkloadRow => ({
  employee: { initials, name },
  weeks: pcts.map((pct, i) => ({ start: WEEKS[i] ?? '', pct })),
});

const overview: PerformanceOverview = {
  workload: [
    wl('AS', 'Ananya Sharma', [95, 120, 115, 90, 80, 70]),
    wl('AR', 'Arjun Reddy', [60, 70, 85, 90, 90, 85]),
    wl('VJ', 'Vikram Joshi', [105, 110, 100, 95, 60, 40]),
    wl('NG', 'Neha Gupta', [80, 85, 90, 100, 100, 95]),
    wl('RV', 'Rahul Verma', [118, 125, 112, 105, 100, 90]),
    wl('TM', 'Tanvi Mehta', [40, 55, 70, 80, 85, 85]),
  ],
  cycle: {
    name: 'H2 2026 review cycle',
    closes: '15 Dec',
    self: 96,
    manager: 42,
    calibration: 0,
    shared: 0,
    total: 128,
  },
  goals: [
    {
      id: 'g1',
      title: 'Launch payments v2 in 3 cities',
      owner: { initials: 'AS', name: 'Ananya Sharma' },
      due: '30 Nov',
      progress: 82,
      status: 'on_track',
    },
    {
      id: 'g2',
      title: 'Cut support backlog to under 50',
      owner: { initials: 'RK', name: 'Ravi Kumar' },
      due: '31 Oct',
      progress: 48,
      status: 'at_risk',
    },
    {
      id: 'g3',
      title: 'Close ₹ 3 Cr new revenue in Q3',
      owner: { initials: 'SD', name: 'Sneha Das' },
      due: '31 Dec',
      progress: 64,
      status: 'on_track',
    },
    {
      id: 'g4',
      title: 'Redesign onboarding flow',
      owner: { initials: 'NG', name: 'Neha Gupta' },
      due: '15 Nov',
      progress: 30,
      status: 'behind',
    },
    {
      id: 'g5',
      title: 'Automate month-end close',
      owner: { initials: 'PM', name: 'Priya Menon' },
      due: '31 Dec',
      progress: 55,
      status: 'on_track',
    },
  ],
  goalsTotal: 24,
  goalsOnTrack: 18,
  recognition: [
    {
      employee: { initials: 'AS', name: 'Ananya Sharma' },
      reason: 'Shipped payments v2 beta',
      stars: 12,
    },
    {
      employee: { initials: 'KS', name: 'Kabir Singh' },
      reason: 'Won the Saffron Retail deal',
      stars: 9,
    },
    {
      employee: { initials: 'TM', name: 'Tanvi Mehta' },
      reason: 'Mentored 3 new joiners',
      stars: 7,
    },
  ],
};

export const getPerformanceOverview = () => demoDelay(structuredClone(overview));
