import type { QuestionKind } from '@hrms/shared';

export interface MarkableQuestion {
  kind: QuestionKind;
  answer: unknown;
  points: number;
}

/** Lower case, single spaces, no surrounding punctuation: "  Mumbai. " matches "mumbai". */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?'"]+|[\s.,;:!?'"]+$/g, '');

/**
 * Points for one answer, or null when a person has to mark it (written answers, and short
 * answers with no accepted list). Multiple-choice is all or nothing: every right choice and no
 * wrong one. A missing answer scores 0.
 */
export function markAnswer(q: MarkableQuestion, given: unknown): number | null {
  const none = given === undefined || given === null || given === '';
  switch (q.kind) {
    case 'SINGLE':
    case 'TRUE_FALSE':
    case 'MULTIPLE': {
      if (none) return 0;
      const right = new Set(q.answer as string[]);
      const picked = new Set(Array.isArray(given) ? (given as string[]) : [String(given)]);
      const exact = right.size === picked.size && [...right].every((x) => picked.has(x));
      return exact ? q.points : 0;
    }
    case 'NUMBER': {
      if (none) return 0;
      const n = typeof given === 'number' ? given : Number(String(given).replace(/[, ]/g, ''));
      const { value, tolerance = 0 } = q.answer as { value: number; tolerance?: number };
      return Number.isFinite(n) && Math.abs(n - value) <= tolerance + 1e-9 ? q.points : 0;
    }
    case 'SHORT': {
      const accepted = Array.isArray(q.answer) ? (q.answer as string[]) : [];
      if (!accepted.length) return none ? 0 : null;
      if (none) return 0;
      return accepted.map(normalise).includes(normalise(String(given))) ? q.points : 0;
    }
    case 'LONG':
      return none ? 0 : null;
  }
}

/** A Fisher–Yates shuffle with an injectable random source, so tests can pin the order. */
export function shuffled<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
