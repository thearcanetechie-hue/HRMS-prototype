import { payrollPolicySchema } from '@hrms/shared';
import {
  calculate,
  earnedShare,
  gratuity,
  hraExemption,
  incomeTax,
  labourWelfareFund,
  NO_DECLARATION,
  professionalTax,
  structure,
  type MonthInput,
} from '../src/payroll/calc';

const policy = payrollPolicySchema.parse({});
const salary = (annualCtc: number, basicShare = 0.5, metro = true) => ({
  annualCtc,
  basicShare,
  metro,
});

function month(full: ReturnType<typeof structure>, extra: Partial<MonthInput> = {}): MonthInput {
  return {
    month: '2026-10',
    full,
    metro: true,
    daysEmployed: 31,
    lopDays: 0,
    overtimeHours: 0,
    reimbursements: 0,
    items: [],
    state: 'Karnataka',
    esiCovered: full.esiApplies,
    tax: {
      regime: 'NEW',
      age: 35,
      ytd: { taxable: 0, tds: 0, pt: 0, pf: 0, months: 0 },
      monthsAfter: 5,
      declaration: NO_DECLARATION,
    },
    ...extra,
  };
}

describe('Payroll maths', () => {
  it('splits a ₹ 12 L CTC, with EPF, EPS, EDLI and admin from the ₹ 15,000 wage ceiling', () => {
    const full = structure(salary(12_00_000), policy);
    // Employer PF (12% of the ₹ 15,000 ceiling) comes out of the ₹ 1,00,000 monthly CTC.
    expect([full.gross, full.basic, full.hra, full.special]).toEqual([
      98_200, 49_100, 24_550, 24_550,
    ]);
    const p = calculate(month(full), policy);
    expect([p.pf, p.employerPf, p.eps, p.edli, p.pfAdmin]).toEqual([1_800, 1_800, 1_250, 75, 75]);
    expect([p.esi, p.pt, p.lwf, p.tds]).toEqual([0, 200, 0, 0]);
    expect(p.net).toBe(96_200);
  });

  it('treats allowances over 50% of pay as wages under the Code on Wages, unless switched off', () => {
    const coded = calculate(month(structure(salary(6_00_000, 0.3), policy)), policy);
    // Basic is 30% of gross, so wages are topped up to 50%: over the ceiling, so ₹ 1,800 PF.
    expect(coded.pf).toBe(1_800);
    const off = payrollPolicySchema.parse({ labourCodeWages: { enabled: false } });
    const plain = calculate(month(structure(salary(6_00_000, 0.3), off)), off);
    expect(plain.pf).toBe(1_737);
  });

  it('applies ESI to low wages, with employer ESI inside CTC and ESI rounded up', () => {
    const full = structure(salary(2_40_000, 0.5, false), policy);
    expect([full.esiApplies, full.gross, full.basic, full.hra]).toEqual([
      true,
      18_307,
      9_154,
      3_662,
    ]);
    const p = calculate(month(full, { metro: false }), policy);
    expect([p.pf, p.esi, p.employerEsi, p.pt]).toEqual([1_098, 138, 595, 0]);
    expect(p.net).toBe(17_071);
    // Staying covered for the contribution period even after a raise.
    const raised = calculate(
      month(structure(salary(4_00_000), policy), { esiCovered: true }),
      policy,
    );
    expect(raised.esi).toBeGreaterThan(0);
  });

  it('prorates for loss of pay by the policy’s day count, and pays overtime at twice the ordinary rate', () => {
    const full = structure(salary(12_00_000), policy);
    expect(calculate(month(full, { lopDays: 3.1 }), policy).gross).toBe(88_380);
    expect(earnedShare(31, 31, 3, 'FIXED_30')).toBeCloseTo(0.9);
    expect(earnedShare(31, 31, 3, 'FIXED_26')).toBeCloseTo(23 / 26);
    expect(earnedShare(31, 17, 0, 'FIXED_26')).toBeCloseTo(17 / 31);
    // 3 hours × ₹ 98,200 ÷ 26 days ÷ 8 hours × 2.
    expect(calculate(month(full, { overtimeHours: 3 }), policy).overtimePay).toBe(2_833);
    const onBasic = payrollPolicySchema.parse({ overtime: { basis: 'BASIC' } });
    expect(calculate(month(full, { overtimeHours: 3 }), onBasic).overtimePay).toBe(1_416);
  });

  it('works out tax under the new regime with rebate, marginal relief, surcharge and cess', () => {
    expect(incomeTax(12_00_000, 'NEW')).toBe(0);
    expect(incomeTax(12_10_000, 'NEW')).toBe(10_400);
    expect(incomeTax(60_00_000, 'NEW')).toBe(15_78_720);
    // Marginal relief just over ₹ 50 lakh: the surcharge can't cost more than the extra income.
    expect(incomeTax(50_10_000, 'NEW')).toBe(11_33_600);
    const full = structure(salary(30_00_000), policy);
    const p = calculate(
      month(full, { month: '2026-04', tax: { ...month(full).tax, monthsAfter: 11 } }),
      policy,
    );
    expect(p.annualTax).toBe(4_69_060);
    expect(p.tds).toBe(39_088);
  });

  it('works out the old regime with HRA exemption and Chapter VI-A from the declaration', () => {
    expect(hraExemption(7_44_600, 14_89_200, 4_80_000, true)).toBe(3_31_080);
    expect(incomeTax(5_00_000, 'OLD')).toBe(0);
    expect(incomeTax(5_00_010, 'OLD')).toBe(13_000);
    const full = structure(salary(30_00_000), policy);
    const p = calculate(
      month(full, {
        month: '2026-04',
        tax: {
          regime: 'OLD',
          age: 35,
          ytd: { taxable: 0, tds: 0, pt: 0, pf: 0, months: 0 },
          monthsAfter: 11,
          declaration: { ...NO_DECLARATION, rentMonthly: 40_000, sec80C: 1_50_000, sec80D: 25_000 },
        },
      }),
      policy,
    );
    expect(p.annualTax).toBe(5_60_020);
    expect(p.tds).toBe(46_668);
  });

  it('spreads what’s left of the year’s tax over the months left', () => {
    const full = structure(salary(30_00_000), policy);
    const base = month(full).tax;
    // Six months already paid with ₹ 2,00,000 deducted: the rest over October to March.
    const p = calculate(
      month(full, {
        tax: {
          ...base,
          ytd: { taxable: full.gross * 6, tds: 2_00_000, pt: 1_200, pf: 10_800, months: 6 },
          monthsAfter: 5,
        },
      }),
      policy,
    );
    expect(p.tds).toBe(Math.round((4_69_060 - 2_00_000) / 6));
  });

  it('uses state professional tax and labour welfare fund schedules', () => {
    expect(professionalTax('Karnataka', 30_000, '2027-02')).toBe(300);
    expect(professionalTax('Maharashtra', 9_000, '2026-10')).toBe(175);
    expect(professionalTax('Delhi', 90_000, '2026-10')).toBe(0);
    expect(labourWelfareFund('Karnataka', '2026-12')).toEqual({ employee: 50, employer: 100 });
    expect(labourWelfareFund('Karnataka', '2026-11')).toEqual({ employee: 0, employer: 0 });
    expect(labourWelfareFund('Maharashtra', '2026-06')).toEqual({ employee: 25, employer: 75 });
  });

  it('works out gratuity: 15 days per year over 26, part years over six months rounding up', () => {
    const opts = { fixedTerm: false, deathOrDisablement: false };
    expect(gratuity(30_000, '2020-01-01', '2026-08-15', policy, opts)).toMatchObject({
      eligible: true,
      years: 7,
      amount: 1_21_154,
    });
    // 4 years and 8 months: over 4 years 240 days, so it counts as five.
    expect(gratuity(30_000, '2022-03-01', '2026-10-31', policy, opts)).toMatchObject({
      eligible: true,
      years: 5,
      amount: 86_538,
    });
    expect(gratuity(30_000, '2023-01-01', '2026-10-31', policy, opts)).toMatchObject({
      eligible: false,
      amount: 0,
    });
    expect(
      gratuity(30_000, '2023-01-01', '2026-10-31', policy, { ...opts, fixedTerm: true }),
    ).toMatchObject({
      eligible: true,
      years: 4,
      amount: 69_231,
    });
    expect(gratuity(5_00_000, '1990-01-01', '2026-10-31', policy, opts).amount).toBe(20_00_000);
  });
});
