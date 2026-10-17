import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';
import type { LogEvent } from './employees';

/** The parts of a person's page that belong to modules not built yet. */
export type ProfileExtras = {
  pay: { ctc: number; payGroup: string; shift: string; noticeDays: number };
  attendance: {
    period: string;
    presentDays: number;
    workingDays: number;
    avgCheckIn: string;
    avgHours: string;
    lateMarks: number;
    overtime: string;
  };
  leave: { type: string; left: number; total: number; tone: Tone }[];
  documents: { name: string; status: string }[];
  performance: { cycle: string; rating: string; goals: { title: string; pct: number }[] };
  timeline: LogEvent[];
};

const extras: ProfileExtras = {
  pay: {
    ctc: 1850000,
    payGroup: 'Bengaluru · monthly',
    shift: 'General · 09:30 – 18:30',
    noticeDays: 60,
  },
  attendance: {
    period: '1 – 17 Oct',
    presentDays: 12,
    workingDays: 12,
    avgCheckIn: '09:14',
    avgHours: '8 h 42 m',
    lateMarks: 0,
    overtime: '3 h',
  },
  leave: [
    { type: 'Paid leave', left: 11, total: 18, tone: 'info' },
    { type: 'Sick leave', left: 8, total: 12, tone: 'warning' },
    { type: 'Casual leave', left: 5, total: 8, tone: 'success' },
    { type: 'Comp off', left: 1, total: 2, tone: 'primary' },
  ],
  documents: [
    { name: 'Offer letter.pdf', status: 'Signed · 28 Dec 2023' },
    { name: 'Aadhaar card.pdf', status: 'Verified' },
    { name: 'PAN card.jpg', status: 'Verified' },
    { name: 'Form 16 FY25.pdf', status: 'Issued 12 Jun' },
  ],
  performance: {
    cycle: 'H1 2026 review',
    rating: 'Exceeds',
    goals: [
      { title: 'Ship payments v2', pct: 100 },
      { title: 'Mentor 2 engineers', pct: 70 },
      { title: 'Cut API latency 30%', pct: 55 },
    ],
  },
  timeline: [
    {
      id: 't1',
      day: 'Today',
      at: '09:12',
      icon: 'check-in',
      tone: 'success',
      title: 'Checked in',
      detail: 'Biometric · Bengaluru office',
      type: 'attendance',
    },
    {
      id: 't2',
      day: '12 Jun',
      icon: 'file',
      tone: 'detail',
      title: 'Form 16 issued',
      detail: 'FY 2024–25',
      type: 'documents',
    },
    {
      id: 't3',
      day: '03 Jan 2024',
      icon: 'joined',
      tone: 'success',
      title: 'Joined',
      detail: 'Engineering',
      type: 'lifecycle',
    },
  ],
};

export const getProfileExtras = (_employeeId: string) => demoDelay(extras);
