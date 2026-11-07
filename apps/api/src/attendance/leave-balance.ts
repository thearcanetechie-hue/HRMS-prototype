/**
 * Leave balance rules, kept free of the database so they're easy to test and review.
 *
 * - Yearly types grant the year's days up front; monthly types build up a twelfth a month.
 * - With proration on (the default), someone who joins or leaves during the year gets days only
 *   for the months they're employed, counting the joining and leaving months in full.
 * - Ledger entries (opening balances, HR adjustments, carry forward, encashed or lapsed days)
 *   add to or take from the year's entitlement.
 * - Comp-off types have no yearly allowance; the balance is the unexpired comp-off earned.
 * - Results are rounded to the nearest half day.
 */

export interface TypeRule {
  daysPerYear: number | null;
  accrual: 'YEARLY' | 'MONTHLY';
  isCompOff: boolean;
}

export interface Tenure {
  joined: string;
  exited: string | null;
}

export interface ProrationPolicy {
  prorateJoiners: boolean;
  prorateLeavers: boolean;
}

export const half = (n: number) => Math.round(n * 2) / 2;
const year = (iso: string) => Number(iso.slice(0, 4));
const month = (iso: string) => Number(iso.slice(5, 7));

/** Days a type grants for a year, before ledger entries. null means no limit. */
export function entitlement(
  t: TypeRule,
  y: number,
  today: string,
  person: Tenure,
  policy: ProrationPolicy,
): number | null {
  if (t.isCompOff || t.daysPerYear === null) return null;
  if (year(person.joined) > y) return 0;
  let first = 1;
  let last = 12;
  if (policy.prorateJoiners && year(person.joined) === y) first = month(person.joined);
  if (person.exited && policy.prorateLeavers) {
    if (year(person.exited) < y) return 0;
    if (year(person.exited) === y) last = month(person.exited);
  }
  if (t.accrual === 'MONTHLY') {
    const upTo = y < year(today) ? 12 : y > year(today) ? 0 : month(today);
    last = Math.min(last, upTo);
  }
  return half((t.daysPerYear * Math.max(0, last - first + 1)) / 12);
}

export interface BalanceLine {
  entitled: number | null;
  used: number;
  pending: number;
  left: number | null;
}

/** A yearly type's balance: entitlement plus ledger, less approved and pending leave. */
export function yearlyBalance(
  entitled: number | null,
  ledger: number,
  used: number,
  pending: number,
): BalanceLine {
  if (entitled === null) return { entitled: null, used, pending, left: null };
  const total = half(entitled + ledger);
  return { entitled: total, used, pending, left: Math.max(0, half(total - used - pending)) };
}

export interface CompOffCredit {
  days: number;
  sourceDate: string;
  expiresOn: string | null;
}

/**
 * A comp-off balance: unexpired credits less comp-off leave taken since the earliest of them.
 * Leave taken uses up the oldest credits first, so expiry only ever removes unused days.
 */
export function compOffBalance(
  credits: CompOffCredit[],
  taken: { date: string; days: number; status: 'APPROVED' | 'PENDING' }[],
  today: string,
): BalanceLine {
  const live = credits
    .filter((c) => !c.expiresOn || c.expiresOn >= today)
    .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate));
  const since = live[0]?.sourceDate ?? today;
  const relevant = taken.filter((t) => t.date >= since);
  const used = relevant.filter((t) => t.status === 'APPROVED').reduce((n, t) => n + t.days, 0);
  const pending = relevant.filter((t) => t.status === 'PENDING').reduce((n, t) => n + t.days, 0);
  const earned = live.reduce((n, c) => n + c.days, 0);
  return { entitled: earned, used, pending, left: Math.max(0, half(earned - used - pending)) };
}

/** Comp-off earned for hours worked on a day off: a full day, half a day, or nothing. */
export function compOffDays(minutesWorked: number, halfDayHours: number, fullDayHours: number) {
  if (minutesWorked >= fullDayHours * 60) return 1;
  if (minutesWorked >= halfDayHours * 60) return 0.5;
  return 0;
}

/** Year end: what carries into next year, and what is left over (to lapse or encash). */
export function yearEnd(left: number, carryForwardCap: number) {
  const carry = Math.min(left, carryForwardCap);
  return { carry, leftover: half(left - carry) };
}

/**
 * Leave days a request counts. Normally only working days; with the sandwich rule, weekly offs
 * and holidays that fall between the first and last working day of the leave count too.
 */
export function leaveDays(days: { date: string; working: boolean }[], sandwich: boolean) {
  const working = days.filter((d) => d.working);
  if (!working.length) return 0;
  if (!sandwich) return working.length;
  const first = working[0]!.date;
  const last = working[working.length - 1]!.date;
  return days.filter((d) => d.date >= first && d.date <= last).length;
}

/** Late marks to unpaid days: every N lates in a month cost half a day. */
export function latePenaltyDays(lates: number, latesPerHalfDay: number, enabled: boolean) {
  return enabled ? Math.floor(lates / latesPerHalfDay) * 0.5 : 0;
}
