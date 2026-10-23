import {
  compOffBalance,
  compOffDays,
  entitlement,
  latePenaltyDays,
  leaveDays,
  yearEnd,
  yearlyBalance,
} from '../src/attendance/leave-balance';

const PL = { daysPerYear: 18, accrual: 'MONTHLY' as const, isCompOff: false };
const SL = { daysPerYear: 12, accrual: 'YEARLY' as const, isCompOff: false };
const prorate = { prorateJoiners: true, prorateLeavers: true };
const veteran = { joined: '2020-03-10', exited: null };

describe('leave balance rules', () => {
  it('accrues monthly types month by month and grants yearly types up front', () => {
    expect(entitlement(PL, 2026, '2026-10-23', veteran, prorate)).toBe(15);
    expect(entitlement(PL, 2025, '2026-10-23', veteran, prorate)).toBe(18);
    expect(entitlement(SL, 2026, '2026-10-23', veteran, prorate)).toBe(12);
  });

  it('prorates joiners and leavers by month, to the nearest half day', () => {
    const joiner = { joined: '2026-07-15', exited: null };
    // July to December is 6 months of 12.
    expect(entitlement(SL, 2026, '2026-10-23', joiner, prorate)).toBe(6);
    // Monthly: July to October.
    expect(entitlement(PL, 2026, '2026-10-23', joiner, prorate)).toBe(6);
    expect(entitlement(SL, 2026, '2026-10-23', joiner, { ...prorate, prorateJoiners: false })).toBe(
      12,
    );
    const leaver = { joined: '2020-01-01', exited: '2026-04-30' };
    expect(entitlement(SL, 2026, '2026-10-23', leaver, prorate)).toBe(4);
    expect(entitlement(SL, 2027, '2026-10-23', leaver, prorate)).toBe(0);
    // 7 days a year, joining in June: 7 × 7/12 = 4.08, which rounds to 4.
    expect(
      entitlement(
        { ...SL, daysPerYear: 7 },
        2026,
        '2026-10-23',
        { joined: '2026-06-01', exited: null },
        prorate,
      ),
    ).toBe(4);
  });

  it('adds the ledger and never goes below zero', () => {
    expect(yearlyBalance(12, 3, 4, 1)).toEqual({ entitled: 15, used: 4, pending: 1, left: 10 });
    expect(yearlyBalance(12, -14, 0, 0).left).toBe(0);
    expect(yearlyBalance(null, 5, 2, 0)).toEqual({
      entitled: null,
      used: 2,
      pending: 0,
      left: null,
    });
  });

  it('counts comp-off from unexpired credits only', () => {
    const credits = [
      { days: 1, sourceDate: '2026-05-02', expiresOn: '2026-07-31' },
      { days: 1, sourceDate: '2026-09-05', expiresOn: '2026-12-04' },
      { days: 0.5, sourceDate: '2026-10-04', expiresOn: '2027-01-02' },
    ];
    const taken = [
      { date: '2026-06-10', days: 1, status: 'APPROVED' as const },
      { date: '2026-09-20', days: 1, status: 'APPROVED' as const },
    ];
    expect(compOffBalance(credits, taken, '2026-10-23')).toEqual({
      entitled: 1.5,
      used: 1,
      pending: 0,
      left: 0.5,
    });
    expect(compOffDays(9 * 60, 4, 8)).toBe(1);
    expect(compOffDays(5 * 60, 4, 8)).toBe(0.5);
    expect(compOffDays(3 * 60, 4, 8)).toBe(0);
  });

  it('splits year-end leftovers into carry forward and the rest', () => {
    expect(yearEnd(10, 6)).toEqual({ carry: 6, leftover: 4 });
    expect(yearEnd(3.5, 6)).toEqual({ carry: 3.5, leftover: 0 });
    expect(yearEnd(5, 0)).toEqual({ carry: 0, leftover: 5 });
  });

  it('applies the sandwich rule only between working days of the leave', () => {
    // Thursday to Tuesday with a weekend in the middle.
    const days = [
      { date: '2026-10-22', working: true },
      { date: '2026-10-23', working: true },
      { date: '2026-10-24', working: false },
      { date: '2026-10-25', working: false },
      { date: '2026-10-26', working: true },
    ];
    expect(leaveDays(days, false)).toBe(3);
    expect(leaveDays(days, true)).toBe(5);
    // Leave that starts on a weekend doesn't count the weekend before the first working day.
    expect(leaveDays(days.slice(2), true)).toBe(1);
    expect(leaveDays(days.slice(2, 4), true)).toBe(0);
  });

  it('turns late marks into half days only when the policy is on', () => {
    expect(latePenaltyDays(7, 3, true)).toBe(1);
    expect(latePenaltyDays(2, 3, true)).toBe(0);
    expect(latePenaltyDays(9, 3, false)).toBe(0);
  });
});
