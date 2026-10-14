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
