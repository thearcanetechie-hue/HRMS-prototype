import { demoDelay } from '@/lib/format';

export type Person = { initials: string; name: string; team?: string };

export type OvertimeRequest = {
  id: string;
  employee: Person;
  date: string;
  hours: number;
  reason: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
};

export type ExpenseClaim = {
  id: string;
  employee: Person;
  category: string;
  spentOn: string;
  receipt: 'attached' | 'missing';
  amount: number;
  status: 'pending' | 'approved' | 'on_hold' | 'paid' | 'rejected';
  receiptFile?: string;
  receiptNote?: string;
  details?: [string, string][];
};

export type ClaimsOverview = {
  overtime: OvertimeRequest[];
  claims: ExpenseClaim[];
  pendingClaimsCount: number;
  pendingClaimsAmount: number;
  spend: { label: string; amount: number }[];
};

const p = (initials: string, name: string, team: string): Person => ({ initials, name, team });

const overview: ClaimsOverview = {
  overtime: [
    {
      id: 'o1',
      employee: p('RK', 'Ravi Kumar', 'Operations'),
      date: '15 Oct',
      hours: 6,
      reason: 'Warehouse stock count',
      amount: 4620,
      status: 'pending',
    },
    {
      id: 'o2',
      employee: p('VJ', 'Vikram Joshi', 'Engineering'),
      date: '14 Oct',
      hours: 4.5,
      reason: 'Release night v3.2',
      amount: 5180,
      status: 'pending',
    },
    {
      id: 'o3',
      employee: p('SD', 'Sneha Das', 'Sales'),
      date: '12 Oct',
      hours: 3,
      reason: 'Client demo, Kolkata',
      amount: 2940,
      status: 'approved',
    },
    {
      id: 'o4',
      employee: p('AS', 'Ananya Sharma', 'Engineering'),
      date: '11 Oct',
      hours: 3,
      reason: 'Production incident',
      amount: 4260,
      status: 'pending',
    },
    {
      id: 'o5',
      employee: p('VS', 'Vinod S.', 'Operations'),
      date: '10 Oct',
      hours: 8,
      reason: 'Saturday shift cover',
      amount: 1320,
      status: 'pending',
    },
  ],
  claims: [
    {
      id: 'c1',
      employee: p('PM', 'Priya Menon', 'Finance'),
      category: 'Travel',
      spentOn: '09 Oct',
      receipt: 'attached',
      amount: 4820,
      status: 'pending',
      receiptFile: 'uber-receipt-09oct.pdf',
      receiptNote: 'Read automatically · amount and date match',
      details: [
        ['Trip', 'Kochi office to client, Kakkanad'],
        ['Spent on', '09 Oct 2026'],
        ['Amount', '₹ 4,820'],
        ['Policy limit', '₹ 6,000 per trip'],
        ['Pays out', 'With October payroll'],
      ],
    },
    {
      id: 'c2',
      employee: p('KS', 'Kabir Singh', 'Sales'),
      category: 'Client meal',
      spentOn: '08 Oct',
      receipt: 'attached',
      amount: 2350,
      status: 'pending',
      receiptFile: 'saffron-bistro-bill.jpg',
      receiptNote: 'Read automatically · amount and date match',
      details: [
        ['Client', 'Saffron Retail'],
        ['Spent on', '08 Oct 2026'],
        ['Amount', '₹ 2,350'],
        ['Policy limit', '₹ 3,000 per meal'],
        ['Pays out', 'With October payroll'],
      ],
    },
    {
      id: 'c3',
      employee: p('NG', 'Neha Gupta', 'Design'),
      category: 'Software',
      spentOn: '05 Oct',
      receipt: 'attached',
      amount: 1999,
      status: 'approved',
      receiptFile: 'figma-invoice-oct.pdf',
      receiptNote: 'Read automatically · amount and date match',
      details: [
        ['Item', 'Design plugin licence'],
        ['Spent on', '05 Oct 2026'],
        ['Amount', '₹ 1,999'],
        ['Pays out', 'With October payroll'],
      ],
    },
    {
      id: 'c4',
      employee: p('AR', 'Arjun Reddy', 'Engineering'),
      category: 'Internet',
      spentOn: '01 Oct',
      receipt: 'missing',
      amount: 1000,
      status: 'on_hold',
      details: [
        ['Item', 'Home broadband, October'],
        ['Spent on', '01 Oct 2026'],
        ['Amount', '₹ 1,000'],
        ['Policy limit', '₹ 1,000 a month'],
      ],
    },
  ],
  pendingClaimsCount: 47,
  pendingClaimsAmount: 218000,
  spend: [
    { label: 'Travel', amount: 92400 },
    { label: 'Client meals', amount: 41800 },
    { label: 'Internet & phone', amount: 38000 },
    { label: 'Software', amount: 26300 },
    { label: 'Other', amount: 19500 },
  ],
};

export const getClaimsOverview = () => demoDelay(structuredClone(overview));
