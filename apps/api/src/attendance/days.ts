/** Date helpers for attendance. Dates are plain calendar days (`2026-10-21`), stored as DATE. */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India. */
export function todayIst(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes past midnight in India for a timestamp. */
export function istMinutes(t: Date) {
  const d = new Date(t.getTime() + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number) {
  return isoDay(new Date(toDate(iso).getTime() + n * 86_400_000));
}

/** Saturday and Sunday are off. (Company-specific weekly offs and holidays come later.) */
export function isWeekend(iso: string) {
  const dow = toDate(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Every date from start to end, inclusive. */
export function eachDay(start: string, end: string) {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export function workingDays(start: string, end: string) {
  return eachDay(start, end).filter((d) => !isWeekend(d)).length;
}

export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = `${month}-01`;
  const end = isoDay(new Date(Date.UTC(y, m, 0)));
  return { start, end };
}

/** After this time a check-in counts as late. */
export const LATE_AFTER_MINUTES = 10 * 60;
