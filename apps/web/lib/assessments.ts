import type { QuestionKind } from '@hrms/shared';
import type { BadgeTone } from '@/components/ui/badge';

export type Purpose = 'GENERAL' | 'TRAINING' | 'HIRING' | 'REVIEW' | 'COMPLIANCE';
export type ResultsVisibility = 'AFTER_SUBMIT' | 'AFTER_CLOSE' | 'NEVER';
export type AssessmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface Option {
  id: string;
  text: string;
}
export interface Question {
  id?: string;
  kind: QuestionKind;
  prompt: string;
  options: Option[];
  answer: string[] | { value: number; tolerance: number } | null;
  points: number;
  explanation: string;
}

export interface Assessment {
  id: string;
  title: string;
  description: string;
  purpose: Purpose;
  status: AssessmentStatus;
  timeLimitMinutes: number | null;
  passPercent: number;
  maxAttempts: number;
  shuffle: boolean;
  showResults: ResultsVisibility;
  opensAt: string | null;
  closesAt: string | null;
  courseId: string | null;
}

export const KIND_NAME: Record<QuestionKind, string> = {
  SINGLE: 'One right choice',
  MULTIPLE: 'Several right choices',
  TRUE_FALSE: 'True or false',
  NUMBER: 'Number',
  SHORT: 'Short answer',
  LONG: 'Written answer (marked by hand)',
};
export const PURPOSE_NAME: Record<Purpose, string> = {
  GENERAL: 'General',
  TRAINING: 'After training',
  HIRING: 'Hiring',
  REVIEW: 'Performance review',
  COMPLIANCE: 'Compliance',
};
export const STATUS_TONE: Record<AssessmentStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'info',
};
export const STATUS_NAME: Record<AssessmentStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Open',
  CLOSED: 'Closed',
};

/** A blank question of a kind, with sensible starting choices. */
export function blankQuestion(kind: QuestionKind): Question {
  const base = { kind, prompt: '', points: 1, explanation: '' };
  if (kind === 'TRUE_FALSE')
    return {
      ...base,
      options: [
        { id: 't', text: 'True' },
        { id: 'f', text: 'False' },
      ],
      answer: ['t'],
    };
  if (kind === 'SINGLE' || kind === 'MULTIPLE')
    return {
      ...base,
      options: [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
      ],
      answer: ['a'],
    };
  if (kind === 'NUMBER') return { ...base, options: [], answer: { value: 0, tolerance: 0 } };
  if (kind === 'SHORT') return { ...base, options: [], answer: [] };
  return { ...base, options: [], answer: null, points: 5 };
}

export const nextOptionId = (options: Option[]) =>
  'abcdefghijkl'.split('').find((c) => !options.some((o) => o.id === c)) ?? String(options.length);

/** "12 min", "1 h 5 min" */
export function duration(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
