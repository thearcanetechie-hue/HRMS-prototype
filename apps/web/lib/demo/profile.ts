import { demoDelay } from '@/lib/format';

/**
 * The part of a person's page that belongs to a module not built yet (performance).
 * Attendance, leave, documents, assets and the timeline already come from the API.
 */
export type ProfileExtras = {
  performance: { cycle: string; rating: string; goals: { title: string; pct: number }[] };
};

const extras: ProfileExtras = {
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
