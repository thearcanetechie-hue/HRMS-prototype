import type { BadgeTone } from '@/components/ui/badge';
import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';
import type { Person } from './claims';

export type Post = {
  id: string;
  author: Person & { role: string };
  at: string;
  kind: 'update' | 'announcement' | 'kudos';
  tag?: { label: string; tone: BadgeTone };
  body: string;
  attachment?:
    | { kind: 'image'; title: string; caption: string }
    | {
        kind: 'event';
        month: string;
        day: string;
        title: string;
        when: string;
        going: number;
        maybe: number;
      }
    | { kind: 'kudos'; value: string; to: Person };
  reactions: number;
  comments: number;
};

export type EngagementOverview = {
  posts: Post[];
  pulse: {
    survey: string;
    replies: number;
    score: number;
    items: { label: string; pct: number }[];
  };
  celebrations: {
    person: Person;
    caption: string;
    icon: 'birthday' | 'anniversary' | 'joined';
    tone: Tone;
  }[];
  poll: {
    question: string;
    ends: string;
    votes: number;
    options: { label: string; pct: number }[];
    voted?: string;
  };
  trending: string[];
};

const overview: EngagementOverview = {
  posts: [
    {
      id: 'p1',
      author: { initials: 'KS', name: 'Kabir Singh', role: 'Account Executive, Sales' },
      at: '2 h',
      kind: 'update',
      tag: { label: 'Win', tone: 'success' },
      body: 'We just signed Saffron Retail, our biggest deal this year. 42 stores, 3 states. Huge thanks to Sneha, Vikram and the solutions team for the late nights.',
      attachment: {
        kind: 'image',
        title: 'Saffron Retail × Acme',
        caption: 'Deal signed · 16 Oct 2026',
      },
      reactions: 48,
      comments: 12,
    },
    {
      id: 'p2',
      author: { initials: 'MI', name: 'Meera Iyer', role: 'HR Manager' },
      at: '5 h',
      kind: 'announcement',
      tag: { label: 'Announcement', tone: 'accent' },
      body: 'Diwali at Acme is on. Join us for lunch, rangoli and the lantern contest. Families welcome after 5 pm.',
      attachment: {
        kind: 'event',
        month: 'Nov',
        day: '6',
        title: 'Diwali celebration 2026',
        when: 'Friday · 12:30 – 19:00 · Bengaluru, Pune and online',
        going: 86,
        maybe: 12,
      },
      reactions: 126,
      comments: 31,
    },
    {
      id: 'p3',
      author: { initials: 'TM', name: 'Tanvi Mehta', role: 'Engineering Manager' },
      at: 'Yesterday',
      kind: 'kudos',
      body: 'Kudos to Arjun for owning his first production release in week one. Calm, careful and well documented.',
      attachment: {
        kind: 'kudos',
        value: 'Ownership',
        to: { initials: 'AR', name: 'Arjun Reddy' },
      },
      reactions: 64,
      comments: 9,
    },
  ],
  pulse: {
    survey: 'October survey',
    replies: 104,
    score: 8.2,
    items: [
      { label: 'Feel recognised', pct: 86 },
      { label: 'Manager support', pct: 79 },
      { label: 'Workload is fair', pct: 64 },
    ],
  },
  celebrations: [
    {
      person: { initials: 'NG', name: 'Neha Gupta' },
      caption: 'Birthday · Tue',
      icon: 'birthday',
      tone: 'primary',
    },
    {
      person: { initials: 'RK', name: 'Ravi Kumar' },
      caption: '2 years at Acme · Thu',
      icon: 'anniversary',
      tone: 'detail',
    },
    {
      person: { initials: 'AR', name: 'Arjun Reddy' },
      caption: 'Joined this week',
      icon: 'joined',
      tone: 'success',
    },
  ],
  poll: {
    question: 'Where should the Q4 offsite be?',
    ends: 'Ends Friday',
    votes: 71,
    options: [
      { label: 'Coorg', pct: 46 },
      { label: 'Goa', pct: 34 },
      { label: 'Rishikesh', pct: 20 },
    ],
    voted: 'Coorg',
  },
  trending: ['#DiwaliAtAcme', '#PaymentsV2', '#SaffronWin', '#Kudos', '#NewJoiners'],
};

export const getEngagementOverview = () => demoDelay(structuredClone(overview));
