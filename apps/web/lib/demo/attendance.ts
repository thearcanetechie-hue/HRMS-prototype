import type { BadgeTone } from '@/components/ui/badge';
import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';

export type DayCode = 'P' | 'A' | 'PL' | 'SL' | 'CL' | 'FV' | 'WFH' | 'HD' | 'W' | 'H';

export const DAY_CODES: Record<Exclude<DayCode, 'W' | 'H'>, { label: string; tone: Tone }> = {
  P: { label: 'Present', tone: 'success' },
  A: { label: 'Absent', tone: 'danger' },
  PL: { label: 'Paid leave', tone: 'info' },
  SL: { label: 'Sick leave', tone: 'warning' },
  CL: { label: 'Casual leave', tone: 'success' },
  FV: { label: 'Field visit', tone: 'detail' },
  WFH: { label: 'Work from home', tone: 'info' },
  HD: { label: 'Half day', tone: 'warning' },
};

export type RegisterRow = { employeeId: string; initials: string; name: string; days: DayCode[] };

export type LeaveType = {
  id: string;
  name: string;
  tone: Tone;
  rule: string;
  daysPerYear: number | null;
  carryForward: number;
  active: boolean;
};

export type LeaveRequest = {
  id: string;
  employee: { initials: string; name: string };
  typeId: string;
  dates: string;
  days: string;
  balanceLeft: string;
};

export type AttendanceOverview = {
  month: string;
  daysShown: number;
  /** Weekday of the 1st, Monday = 0. */
  firstWeekday: number;
  summary: { label: string; value: number; tone: Tone }[];
  register: RegisterRow[];
  requests: LeaveRequest[];
  leaveTypes: LeaveType[];
};

const row = (employeeId: string, initials: string, name: string, codes: string) => ({
  employeeId,
  initials,
  name,
  days: codes.split(' ') as DayCode[],
});

const overview: AttendanceOverview = {
  month: 'October 2026',
  daysShown: 17,
  firstWeekday: 3, // 1 Oct 2026 is a Thursday
  summary: [
    { label: 'Present', value: 112, tone: 'success' },
    { label: 'Late', value: 4, tone: 'warning' },
    { label: 'Absent', value: 2, tone: 'danger' },
    { label: 'On leave', value: 6, tone: 'info' },
    { label: 'Field visit', value: 4, tone: 'detail' },
  ],
  register: [
    row('e1', 'AS', 'Ananya Sharma', 'P P W W P P P P P W W P P P P P W'),
    row('e2', 'RK', 'Ravi Kumar', 'P P W W P FV FV P P W W P P P P P W'),
    row('e3', 'PM', 'Priya Menon', 'P PL W W PL PL P P P W W P P P SL SL W'),
    row('e4', 'AR', 'Arjun Reddy', 'P P W W P P A P P W W P P P P P W'),
    row('e5', 'KS', 'Kabir Singh', 'FV FV W W P P P P FV W W FV FV P P P W'),
    row('e6', 'NG', 'Neha Gupta', 'P P W W P P P P P W W P P A P P W'),
    row('e7', 'VJ', 'Vikram Joshi', 'P P W W P P P SL SL W W P P P P P W'),
  ],
  requests: [
    {
      id: 'q1',
      employee: { initials: 'AS', name: 'Ananya Sharma' },
      typeId: 'sick',
      dates: '20–21 Oct',
      days: '2 days',
      balanceLeft: '8 of 12 left',
    },
    {
      id: 'q2',
      employee: { initials: 'RB', name: 'Rohit Bansal' },
      typeId: 'paid',
      dates: '26–30 Oct',
      days: '5 days',
      balanceLeft: '11 of 18 left',
    },
    {
      id: 'q3',
      employee: { initials: 'KS', name: 'Kabir Singh' },
      typeId: 'field',
      dates: '19 Oct',
      days: 'Pune client',
      balanceLeft: 'No limit',
    },
    {
      id: 'q4',
      employee: { initials: 'NG', name: 'Neha Gupta' },
      typeId: 'casual',
      dates: '23 Oct',
      days: '1 day',
      balanceLeft: '5 of 8 left',
    },
  ],
  leaveTypes: [
    {
      id: 'paid',
      name: 'Paid leave',
      tone: 'info',
      rule: '18 days a year · carry forward 6',
      daysPerYear: 18,
      carryForward: 6,
      active: true,
    },
    {
      id: 'sick',
      name: 'Sick leave',
      tone: 'warning',
      rule: '12 days a year · note after 2 days',
      daysPerYear: 12,
      carryForward: 0,
      active: true,
    },
    {
      id: 'casual',
      name: 'Casual leave',
      tone: 'success',
      rule: '8 days a year',
      daysPerYear: 8,
      carryForward: 0,
      active: true,
    },
    {
      id: 'field',
      name: 'Field visit',
      tone: 'detail',
      rule: 'No limit · manager approves',
      daysPerYear: null,
      carryForward: 0,
      active: true,
    },
    {
      id: 'comp',
      name: 'Comp off',
      tone: 'primary',
      rule: 'Earned from weekend work',
      daysPerYear: null,
      carryForward: 0,
      active: true,
    },
    {
      id: 'wfh',
      name: 'Work from home',
      tone: 'info',
      rule: '4 days a month',
      daysPerYear: 48,
      carryForward: 0,
      active: false,
    },
  ],
};

export const getAttendanceOverview = () => demoDelay(structuredClone(overview));

/** Badge tone for a leave type, from its colour tone. */
export const leaveBadgeTone = (t: Tone): BadgeTone =>
  t === 'primary' ? 'accent' : t === 'detail' ? 'neutral' : t;
