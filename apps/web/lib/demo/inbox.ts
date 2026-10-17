import type { BadgeTone } from '@/components/ui/badge';
import { demoDelay } from '@/lib/format';
import type { Person } from './claims';

export type Conversation = {
  id: string;
  with: Person & { where?: string };
  subject: string;
  preview: string;
  at: string;
  unread: boolean;
  tag?: { label: string; tone: BadgeTone };
};

export type Message = {
  id: string;
  from: Person;
  mine: boolean;
  text: string;
  at: string;
  attachment?: { name: string; caption: string };
  request?: { title: string; caption: string; href: string };
  sending?: boolean;
};

export type InboxOverview = {
  folders: { id: string; label: string; count?: number }[];
  channels: { name: string; unread: boolean }[];
  conversations: Conversation[];
  threads: Record<string, Message[]>;
};

const ravi: Person = { initials: 'RK', name: 'Ravi Kumar' };
const meera: Person = { initials: 'MI', name: 'Meera Iyer' };

const overview: InboxOverview = {
  folders: [
    { id: 'all', label: 'All messages', count: 4 },
    { id: 'approvals', label: 'Approvals', count: 14 },
    { id: 'announcements', label: 'Announcements' },
    { id: 'starred', label: 'Starred' },
    { id: 'sent', label: 'Sent' },
  ],
  channels: [
    { name: 'people-team', unread: true },
    { name: 'all-acme', unread: false },
    { name: 'engineering', unread: false },
    { name: 'bengaluru-office', unread: false },
    { name: 'payroll-help', unread: true },
  ],
  conversations: [
    {
      id: 'c1',
      with: { ...ravi, team: 'Operations', where: 'Pune' },
      subject: 'Overtime for stock count',
      preview: 'Sharing the sheet with hours for all 6 people…',
      at: '10:42',
      unread: true,
      tag: { label: 'Approval', tone: 'warning' },
    },
    {
      id: 'c2',
      with: { initials: 'FT', name: 'Finance team', team: 'Finance' },
      subject: 'October payroll inputs',
      preview: 'Please lock attendance by Monday so we can…',
      at: '09:15',
      unread: true,
    },
    {
      id: 'c3',
      with: { initials: 'AR', name: 'Arjun Reddy', team: 'Engineering' },
      subject: 'Laptop and ID card',
      preview: 'Got the laptop, still waiting on the access card',
      at: 'Yesterday',
      unread: true,
    },
    {
      id: 'c4',
      with: { initials: 'PM', name: 'Priya Menon', team: 'Finance' },
      subject: 'Notice period question',
      preview: 'Can I adjust leave against my last 10 days?',
      at: 'Yesterday',
      unread: false,
      tag: { label: 'Exit', tone: 'danger' },
    },
    {
      id: 'c5',
      with: { initials: 'SD', name: 'Sneha Das', team: 'Sales' },
      subject: 'Re: Sales incentive plan',
      preview: 'Thanks Meera, the new slabs look clear',
      at: 'Mon',
      unread: false,
    },
    {
      id: 'c6',
      with: { initials: 'IT', name: 'IT helpdesk', team: 'IT' },
      subject: 'Biometric device offline',
      preview: 'Pune device is back online after reboot.',
      at: 'Mon',
      unread: false,
    },
  ],
  threads: {
    c1: [
      {
        id: 'm1',
        from: ravi,
        mine: false,
        text: 'Hi Meera, we ran the quarterly stock count on Thursday. Six of us stayed back for about 6 hours. Sharing the sheet.',
        at: '10:31',
      },
      {
        id: 'm2',
        from: ravi,
        mine: false,
        text: 'Can this go into October payroll?',
        at: '10:32',
        attachment: { name: 'stock-count-ot-15oct.xlsx', caption: '6 people · 36 hours' },
      },
      {
        id: 'm3',
        from: meera,
        mine: true,
        text: 'Thanks Ravi. Hours look right. I have approved 5, and need a manager sign-off for Vinod since it was his weekly off.',
        at: '10:40',
        request: {
          title: 'Overtime request · 36 h · ₹ 27,720',
          caption: '5 approved · 1 waiting for manager',
          href: '/claims',
        },
      },
    ],
  },
};

export const getInboxOverview = () => demoDelay(structuredClone(overview));
