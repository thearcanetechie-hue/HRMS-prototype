import type { BadgeTone } from '@/components/ui/badge';

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const initials = (first: string, last: string) =>
  ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();

export const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  ONBOARDING: 'accent',
  ON_NOTICE: 'warning',
  EXITED: 'danger',
};

const inrFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Indian rupees with Indian digit grouping: `₹ 1,12,40,000`. */
export const inr = (n: number) => `₹ ${inrFormat.format(n)}`;

/** Plain number with Indian digit grouping. */
export const num = (n: number) => inrFormat.format(n);

/** Pretend network delay for screens that run on demo data, so loading states are real. */
export const demoDelay = <T>(value: T, ms = 250) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
