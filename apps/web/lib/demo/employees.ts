import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';

export type LogIcon =
  'check-in' | 'edit' | 'file' | 'promotion' | 'leave' | 'field' | 'joined' | 'exit';

export type LogEvent = {
  id: string;
  day: string;
  at?: string;
  icon: LogIcon;
  tone: Tone;
  title: string;
  detail: string;
  type: 'attendance' | 'profile' | 'documents' | 'job' | 'leave' | 'lifecycle';
};

const log: LogEvent[] = [
  {
    id: 'l1',
    day: 'Today',
    at: '09:12',
    icon: 'check-in',
    tone: 'success',
    title: 'Ananya Sharma checked in',
    detail: 'Biometric · Bengaluru office',
    type: 'attendance',
  },
  {
    id: 'l2',
    day: 'Today',
    at: '08:40',
    icon: 'edit',
    tone: 'info',
    title: 'Ravi Kumar updated bank details',
    detail: 'Approved by Meera',
    type: 'profile',
  },
  {
    id: 'l3',
    day: 'Today',
    at: '08:15',
    icon: 'file',
    tone: 'detail',
    title: 'Arjun Reddy uploaded Aadhaar',
    detail: 'Verified automatically',
    type: 'documents',
  },
  {
    id: 'l4',
    day: 'Yesterday',
    icon: 'promotion',
    tone: 'primary',
    title: 'Neha Gupta promoted',
    detail: 'Designer to Product Designer',
    type: 'job',
  },
  {
    id: 'l5',
    day: 'Yesterday',
    icon: 'leave',
    tone: 'warning',
    title: 'Priya Menon applied sick leave',
    detail: '20–21 Oct · 2 days',
    type: 'leave',
  },
  {
    id: 'l6',
    day: 'Yesterday',
    at: '11:30',
    icon: 'field',
    tone: 'detail',
    title: 'Kabir Singh started field visit',
    detail: 'Pune client',
    type: 'attendance',
  },
  {
    id: 'l7',
    day: '15 Oct',
    icon: 'joined',
    tone: 'success',
    title: 'Arjun Reddy joined',
    detail: 'Engineering · reports to Ananya',
    type: 'lifecycle',
  },
  {
    id: 'l8',
    day: '15 Oct',
    icon: 'exit',
    tone: 'danger',
    title: 'Farhan Khan exit closed',
    detail: 'Full and final settled',
    type: 'lifecycle',
  },
];

/** "Last seen" text per row until attendance exists, cycled by position. */
export const LAST_SEEN = [
  'In · 09:12',
  'In · 08:55',
  'Sick leave',
  'Day 3',
  'Field · Pune',
  'In · 09:40',
  'In · 09:03',
  'WFH',
  'In · 09:21',
];

export const getEmployeeLog = () => demoDelay(log);
