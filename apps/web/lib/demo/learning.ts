import { demoDelay } from '@/lib/format';
import type { Person } from './claims';

export type Course = {
  id: string;
  title: string;
  category: string;
  lead: string;
  team: string;
  mandatory: boolean;
  schedule: string;
  registered: number;
  seats: number;
  done: number;
  inProgress: number;
  notStarted: number;
  avg: number;
  status: 'ongoing' | 'upcoming' | 'completed';
  due?: string;
};

export type Learner = { employee: Person; progress: number };
export type Session = { courseId: string; title: string; weekday: string; day: string; at: string };

export type LearningOverview = {
  courses: Course[];
  learners: Record<string, Learner[]>;
  sessions: Session[];
};

const course = (c: Course) => c;

const overview: LearningOverview = {
  courses: [
    course({
      id: 'posh',
      title: 'POSH awareness 2026',
      category: 'Mandatory · Compliance',
      lead: 'Meera Iyer',
      team: 'All',
      mandatory: true,
      schedule: '1 – 31 Oct',
      registered: 128,
      seats: 128,
      done: 95,
      inProgress: 18,
      notStarted: 15,
      avg: 74,
      status: 'ongoing',
      due: '31 Oct',
    }),
    course({
      id: 'ai',
      title: 'Applied AI for engineers',
      category: 'Engineering · 6 sessions',
      lead: 'Rahul Verma',
      team: 'Engineering',
      mandatory: false,
      schedule: '7 Oct – 11 Nov',
      registered: 46,
      seats: 50,
      done: 8,
      inProgress: 30,
      notStarted: 8,
      avg: 52,
      status: 'ongoing',
    }),
    course({
      id: 'sell',
      title: 'Consultative selling',
      category: 'Sales · 4 sessions',
      lead: 'Sneha Das',
      team: 'Sales',
      mandatory: false,
      schedule: '14 Oct – 4 Nov',
      registered: 22,
      seats: 25,
      done: 2,
      inProgress: 14,
      notStarted: 6,
      avg: 38,
      status: 'ongoing',
    }),
    course({
      id: 'mgr',
      title: 'First-time managers',
      category: 'Leadership · cohort 3',
      lead: 'Tanvi Mehta',
      team: 'All',
      mandatory: false,
      schedule: '21 Oct – 16 Dec',
      registered: 14,
      seats: 16,
      done: 0,
      inProgress: 9,
      notStarted: 5,
      avg: 12,
      status: 'ongoing',
    }),
    course({
      id: 'pay',
      title: 'Payroll basics for leads',
      category: 'Finance · 2 sessions',
      lead: 'Priya Menon',
      team: 'All',
      mandatory: false,
      schedule: '3 – 10 Nov',
      registered: 18,
      seats: 30,
      done: 0,
      inProgress: 0,
      notStarted: 18,
      avg: 0,
      status: 'upcoming',
    }),
    course({
      id: 'sec',
      title: 'Information security 101',
      category: 'Mandatory · Compliance',
      lead: 'IT team',
      team: 'All',
      mandatory: true,
      schedule: 'Sept 2026',
      registered: 126,
      seats: 128,
      done: 126,
      inProgress: 0,
      notStarted: 0,
      avg: 100,
      status: 'completed',
    }),
  ],
  learners: {
    posh: [
      { employee: { initials: 'AR', name: 'Arjun Reddy' }, progress: 20 },
      { employee: { initials: 'NG', name: 'Neha Gupta' }, progress: 60 },
      { employee: { initials: 'KS', name: 'Kabir Singh' }, progress: 0 },
      { employee: { initials: 'VS', name: 'Vinod S.' }, progress: 0 },
    ],
  },
  sessions: [
    {
      courseId: 'ai',
      title: 'Applied AI · session 3',
      weekday: 'Mon',
      day: '19',
      at: '11:00 · Google Meet',
    },
    {
      courseId: 'mgr',
      title: 'First-time managers',
      weekday: 'Wed',
      day: '21',
      at: '15:00 · Board room, Bengaluru',
    },
    {
      courseId: 'sell',
      title: 'Consultative selling',
      weekday: 'Thu',
      day: '22',
      at: '16:30 · Zoom',
    },
  ],
};

export const getLearningOverview = () => demoDelay(structuredClone(overview));
