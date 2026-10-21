/**
 * Monthly salary maths for India (FY 2026-27 rules as we understand them).
 *
 * IMPORTANT: these figures are a starting point. A chartered accountant must check them, and
 * the rates below, before any real payroll is paid. Rules that change often (tax slabs, state
 * professional tax) are kept as data at the top of this file so they are easy to review.
 *
 * All amounts are whole rupees. Rounding follows common practice: each line is rounded to
 * the nearest rupee, and PF/ESI contributions are rounded up.
 */

/** PF is worked out on basic, capped at the statutory wage ceiling. */
export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15_000;

/** ESI applies while monthly gross is at or below the threshold. */
export const ESI_THRESHOLD = 21_000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;

/** Overtime is paid at twice the ordinary hourly rate (Factories Act s.59). */
export const OVERTIME_MULTIPLIER = 2;
export const WORKING_DAYS_FOR_HOURLY = 26;
export const HOURS_PER_DAY = 8;

/** New tax regime, FY 2026-27: slabs on taxable income after the standard deduction. */
export const STANDARD_DEDUCTION = 75_000;
export const TAX_SLABS: [upTo: number, rate: number][] = [
  [4_00_000, 0],
  [8_00_000, 0.05],
  [12_00_000, 0.1],
  [16_00_000, 0.15],
  [20_00_000, 0.2],
  [24_00_000, 0.25],
  [Infinity, 0.3],
];
/** Section 87A: no tax when taxable income is at or below this. */
export const REBATE_LIMIT = 12_00_000;
export const CESS = 0.04;

/**
 * Monthly professional tax by state: [gross above, tax] pairs, highest first. February is
 * higher in some states to reach the yearly maximum of ₹ 2,500.
 */
export const PROFESSIONAL_TAX: Record<string, { slabs: [number, number][]; february?: number }> = {
  Karnataka: { slabs: [[24_999, 200]], february: 300 },
  Maharashtra: {
    slabs: [
      [10_000, 200],
      [7_500, 175],
    ],
    february: 300,
  },
  'West Bengal': {
    slabs: [
      [40_000, 200],
      [25_000, 150],
      [15_000, 130],
      [10_000, 110],
    ],
  },
  'Tamil Nadu': {
    slabs: [
      [75_000, 208],
      [60_000, 171],
      [45_000, 115],
      [30_000, 52],
      [21_000, 23],
    ],
  },
  Telangana: {
    slabs: [
      [20_000, 200],
      [15_000, 150],
    ],
  },
  'Andhra Pradesh': {
    slabs: [
      [20_000, 200],
      [15_000, 150],
    ],
  },
  Gujarat: { slabs: [[12_000, 200]] },
  Kerala: {
    slabs: [
      [20_000, 208],
      [15_000, 167],
      [12_000, 125],
    ],
  },
  'Madhya Pradesh': { slabs: [[18_750, 208]], february: 212 },
  Odisha: {
    slabs: [
      [25_000, 200],
      [13_304, 125],
    ],
    february: 300,
  },
  Assam: {
    slabs: [
      [25_000, 208],
      [15_000, 180],
    ],
  },
};

export interface SalaryInput {
  annualCtc: number;
  /** Basic as a share of gross, for example 0.5. */
  basicShare: number;
  /** HRA is 50% of basic in metro cities, 40% elsewhere. */
  metro: boolean;
  state: string | null;
}

export interface MonthInput {
  /** YYYY-MM */
  month: string;
  /** Calendar days the person was employed this month (joining/leaving mid-month). */
  daysEmployed: number;
  /** Unpaid days: unpaid leave plus absences, half days as 0.5. */
  lopDays: number;
  overtimeHours: number;
  reimbursements: number;
}

export interface Payslip {
  lines: {
    key: string;
    label: string;
    amount: number;
    kind: 'earning' | 'deduction' | 'employer';
  }[];
  fullGross: number;
  gross: number;
  deductions: number;
  net: number;
  ctcMonthly: number;
  employerPf: number;
  employerEsi: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  overtimePay: number;
  reimbursements: number;
  esiApplies: boolean;
  payableDays: number;
  daysInMonth: number;
}

const r = Math.round;
const up = Math.ceil;

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Yearly tax under the new regime, after rebate and cess. */
export function annualTax(taxableIncome: number) {
  const income = Math.max(0, taxableIncome);
  if (income <= REBATE_LIMIT) return 0;
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of TAX_SLABS) {
    if (income > lower) tax += (Math.min(income, upTo) - lower) * rate;
    lower = upTo;
  }
  // Marginal relief: just above the rebate limit, tax can't exceed the income over the limit.
  tax = Math.min(tax, income - REBATE_LIMIT);
  return r(tax * (1 + CESS));
}

export function professionalTax(state: string | null, gross: number, month: string) {
  const rule = state ? PROFESSIONAL_TAX[state] : undefined;
  if (!rule) return 0;
  const hit = rule.slabs.find(([above]) => gross > above);
  if (!hit) return 0;
  return month.endsWith('-02') && rule.february && hit === rule.slabs[0] ? rule.february : hit[1];
}

/**
 * Full-month gross from CTC. Employer PF and ESI sit inside CTC, and ESI depends on gross, so
 * this tries without ESI first and falls back to including it when gross ends up under the
 * threshold.
 */
export function structure(s: SalaryInput) {
  const ctc = s.annualCtc / 12;
  const solve = (withEsi: boolean) => {
    // gross + employerPf + employerEsi = ctc; employerPf = 12% of min(basic, ceiling).
    const pfOn = (g: number) => Math.min(g * s.basicShare, PF_WAGE_CEILING);
    let gross = ctc;
    for (let i = 0; i < 20; i++)
      gross = ctc - pfOn(gross) * PF_RATE - (withEsi ? gross * ESI_EMPLOYER_RATE : 0);
    return r(gross);
  };
  let gross = solve(false);
  const esiApplies = gross <= ESI_THRESHOLD;
  if (esiApplies) gross = solve(true);
  const basic = r(gross * s.basicShare);
  const hra = r(basic * (s.metro ? 0.5 : 0.4));
  return { ctcMonthly: r(ctc), gross, basic, hra, special: gross - basic - hra, esiApplies };
}

export function calculate(s: SalaryInput, m: MonthInput): Payslip {
  const full = structure(s);
  const dim = daysInMonth(m.month);
  const payableDays = Math.max(0, Math.min(dim, m.daysEmployed) - m.lopDays);
  const factor = payableDays / dim;

  const basic = r(full.basic * factor);
  const hra = r(full.hra * factor);
  const special = r(full.special * factor);
  const hourly = full.basic / WORKING_DAYS_FOR_HOURLY / HOURS_PER_DAY;
  const overtimePay = r(m.overtimeHours * hourly * OVERTIME_MULTIPLIER);
  const gross = basic + hra + special + overtimePay;

  const pfWage = Math.min(basic, PF_WAGE_CEILING);
  const pf = up(pfWage * PF_RATE);
  const employerPf = up(pfWage * PF_RATE);
  // ESI eligibility is fixed by the full-month wage, so a short month doesn't switch it on.
  const esi = full.esiApplies ? up(gross * ESI_EMPLOYEE_RATE) : 0;
  const employerEsi = full.esiApplies ? up(gross * ESI_EMPLOYER_RATE) : 0;
  const pt = payableDays > 0 ? professionalTax(s.state, gross, m.month) : 0;

  // TDS: a twelfth of the year's tax on this structure's full-year taxable pay.
  const yearlyTaxable =
    full.gross * 12 - STANDARD_DEDUCTION - professionalTax(s.state, full.gross, m.month) * 12;
  const tds = payableDays > 0 ? r(annualTax(yearlyTaxable) / 12) : 0;

  const deductions = pf + esi + pt + tds;
  const lines: Payslip['lines'] = [
    { key: 'basic', label: 'Basic', amount: basic, kind: 'earning' },
    { key: 'hra', label: 'House rent allowance', amount: hra, kind: 'earning' },
    { key: 'special', label: 'Special allowance', amount: special, kind: 'earning' },
    ...(overtimePay
      ? [
          {
            key: 'overtime',
            label: `Overtime (${m.overtimeHours} h)`,
            amount: overtimePay,
            kind: 'earning' as const,
          },
        ]
      : []),
    { key: 'pf', label: 'Provident fund', amount: pf, kind: 'deduction' },
    ...(esi ? [{ key: 'esi', label: 'ESI', amount: esi, kind: 'deduction' as const }] : []),
    ...(pt
      ? [{ key: 'pt', label: 'Professional tax', amount: pt, kind: 'deduction' as const }]
      : []),
    ...(tds
      ? [{ key: 'tds', label: 'Income tax (TDS)', amount: tds, kind: 'deduction' as const }]
      : []),
    ...(m.reimbursements
      ? [
          {
            key: 'reimbursements',
            label: 'Reimbursements',
            amount: m.reimbursements,
            kind: 'earning' as const,
          },
        ]
      : []),
    { key: 'employer_pf', label: 'Employer PF', amount: employerPf, kind: 'employer' },
    ...(employerEsi
      ? [
          {
            key: 'employer_esi',
            label: 'Employer ESI',
            amount: employerEsi,
            kind: 'employer' as const,
          },
        ]
      : []),
  ];

  return {
    lines,
    fullGross: full.gross,
    gross,
    deductions,
    net: gross - deductions + m.reimbursements,
    ctcMonthly: full.ctcMonthly,
    employerPf,
    employerEsi,
    pf,
    esi,
    pt,
    tds,
    overtimePay,
    reimbursements: m.reimbursements,
    esiApplies: full.esiApplies,
    payableDays,
    daysInMonth: dim,
  };
}
