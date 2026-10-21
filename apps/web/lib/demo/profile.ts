import { demoDelay } from '@/lib/format';

/**
 * The parts of a person's page that belong to modules not built yet (pay and performance).
 * Attendance, leave, documents, assets and the timeline already come from the API.
 */
export type ProfileExtras = {
  pay: { ctc: number; payGroup: string; shift: string; noticeDays: number };
  performance: { cycle: string; rating: string; goals: { title: string; pct: number }[] };
};

const extras: ProfileExtras = {
  pay: {
    ctc: 1850000,
    payGroup: 'Bengaluru · monthly',
    shift: 'General · 09:30 – 18:30',
    noticeDays: 60,
  },
  performance: {
    cycle: 'H1 2026 review',
    rating: 'Exceeds',
    goals: [
      { title: 'Ship payments v2', pct: 100 },
      { title: 'Mentor 2 engineers', pct: 70 },
      { title: 'Cut API latency 30%', pct: 55 },
    ],
  },
};

export const getProfileExtras = (_employeeId: string) => demoDelay(extras);
