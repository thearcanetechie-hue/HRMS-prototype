/**
 * Monthly payroll maths for India, FY 2026-27, as we understand the law. Pure functions: no
 * database, so every rule can be read, tested and checked here.
 *
 * IMPORTANT: a chartered accountant must review these rules and figures before real payroll.
 * Company-level choices live in the payroll policy (packages/shared/src/policies.ts) so HR can
 * change them; rates set by statute are data at the top of this file with the rule they follow.
 *
 * Amounts are whole rupees. Each line is rounded to the nearest rupee; ESI is rounded up to the
 * next rupee as ESIC requires; annual taxable income is rounded to the nearest ten (s.288A).
 */
import type { PayrollPolicy } from '@hrms/shared';

// ---------------------------------------------------------------- income tax (Income-tax Act, 1961)

type Slab = [upTo: number, rate: number];

/** Section 115BAC (new regime), as amended by the Finance Act 2025, applied for FY 2026-27. */
export const NEW_REGIME = {
  standardDeduction: 75_000,
  slabs: [
    [4_00_000, 0],
    [8_00_000, 0.05],
    [12_00_000, 0.1],
    [16_00_000, 0.15],
    [20_00_000, 0.2],
    [24_00_000, 0.25],
    [Infinity, 0.3],
  ] as Slab[],
  /** Section 87A: no tax up to this taxable income, with marginal relief just above it. */
  rebateLimit: 12_00_000,
  /** Surcharge on income above each threshold; the new regime stops at 25%. */
  surcharge: [
    [50_00_000, 0.1],
    [1_00_00_000, 0.15],
    [2_00_00_000, 0.25],
  ] as Slab[],
};

/** Old regime slabs by age (s.2 of the Finance Act), with the s.87A rebate up to ₹ 5 lakh. */
export const OLD_REGIME = {
  standardDeduction: 50_000,
  slabs: {
    under60: [
      [2_50_000, 0],
      [5_00_000, 0.05],
      [10_00_000, 0.2],
      [Infinity, 0.3],
    ] as Slab[],
    senior: [
      [3_00_000, 0],
      [5_00_000, 0.05],
      [10_00_000, 0.2],
      [Infinity, 0.3],
    ] as Slab[],
    superSenior: [
      [5_00_000, 0],
      [10_00_000, 0.2],
      [Infinity, 0.3],
    ] as Slab[],
  },
  rebateLimit: 5_00_000,
  surcharge: [
    [50_00_000, 0.1],
    [1_00_00_000, 0.15],
    [2_00_00_000, 0.25],
    [5_00_00_000, 0.37],
  ] as Slab[],
  /** Chapter VI-A and s.24(b) limits. */
  limits: {
    sec80C: 1_50_000,
    sec80D: 25_000,
    sec80DSenior: 50_000,
    sec80CCD1B: 50_000,
    homeLoanInterest: 2_00_000,
  },
};

/** Health and education cess on tax plus surcharge. */
export const CESS = 0.04;

export type Regime = 'NEW' | 'OLD';

function slabTax(income: number, slabs: Slab[]) {
  let tax = 0;
  let lower = 0;
  for (const [upTo, rate] of slabs) {
    if (income > lower) tax += (Math.min(income, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** Tax before cess for one regime, with the rebate and its marginal relief. */
function baseTax(income: number, regime: Regime, age: number) {
  if (regime === 'NEW') {
    if (income <= NEW_REGIME.rebateLimit) return 0;
    // Marginal relief: tax can't exceed the income over the rebate limit.
    return Math.min(slabTax(income, NEW_REGIME.slabs), income - NEW_REGIME.rebateLimit);
  }
  if (income <= OLD_REGIME.rebateLimit) return 0;
  const slabs =
    age >= 80
      ? OLD_REGIME.slabs.superSenior
      : age >= 60
        ? OLD_REGIME.slabs.senior
        : OLD_REGIME.slabs.under60;
  return slabTax(income, slabs);
}

/**
 * Yearly income tax including surcharge (with marginal relief at each threshold) and cess,
 * rounded to the nearest ten rupees.
 */
export function incomeTax(taxableIncome: number, regime: Regime, age = 30) {
  const income = Math.max(0, Math.round(taxableIncome / 10) * 10);
  const table = regime === 'NEW' ? NEW_REGIME.surcharge : OLD_REGIME.surcharge;
  const tax = baseTax(income, regime, age);
  let total = tax;
  const band = [...table].reverse().find(([threshold]) => income > threshold);
  if (band) {
    const [threshold, rate] = band;
    const lower = table.filter(([t]) => t < threshold).reverse()[0]?.[1] ?? 0;
    // Marginal relief: the extra tax from crossing a threshold can't exceed the income over it.
    const atThreshold = baseTax(threshold, regime, age) * (1 + lower);
    total = Math.min(tax * (1 + rate), atThreshold + (income - threshold));
  }
  return Math.round((total * (1 + CESS)) / 10) * 10;
}

/** Kept for older callers: new-regime tax for a taxable income. */
export const annualTax = (taxableIncome: number) => incomeTax(taxableIncome, 'NEW');

// ---------------------------------------------------------------- professional tax (state Acts)

/**
 * Monthly professional tax by state: [gross above, tax] pairs, highest first. Some states charge
 * more in February to reach the ₹ 2,500 yearly maximum (Article 276(2)). Verify against each
 * state's current schedule.
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

export function professionalTax(state: string | null, gross: number, month: string) {
  const rule = state ? PROFESSIONAL_TAX[state] : undefined;
  if (!rule) return 0;
  const hit = rule.slabs.find(([above]) => gross > above);
  if (!hit) return 0;
  return month.endsWith('-02') && rule.february && hit === rule.slabs[0] ? rule.february : hit[1];
}

// ---------------------------------------------------------------- labour welfare fund (state Acts)

/**
 * Labour Welfare Fund: months it's deducted, and employee and employer amounts. States not
 * listed have no fund or one that isn't handled yet (Haryana's percentage-based fund, for one).
 * Verify against each state's current notification.
 */
export const LABOUR_WELFARE_FUND: Record<
  string,
  { months: number[]; employee: number; employer: number }
> = {
  Maharashtra: { months: [6, 12], employee: 25, employer: 75 },
  Karnataka: { months: [12], employee: 50, employer: 100 },
  'Tamil Nadu': { months: [12], employee: 20, employer: 40 },
  Gujarat: { months: [6, 12], employee: 6, employer: 12 },
  'West Bengal': { months: [6, 12], employee: 3, employer: 15 },
  'Andhra Pradesh': { months: [12], employee: 30, employer: 70 },
  Telangana: { months: [12], employee: 2, employer: 5 },
  'Madhya Pradesh': { months: [6, 12], employee: 10, employer: 30 },
  Delhi: { months: [6, 12], employee: 0.75, employer: 2.25 },
  Punjab: { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], employee: 5, employer: 20 },
};

export function labourWelfareFund(state: string | null, month: string) {
  const rule = state ? LABOUR_WELFARE_FUND[state] : undefined;
  if (!rule || !rule.months.includes(Number(month.slice(5, 7))))
    return { employee: 0, employer: 0 };
  return { employee: Math.round(rule.employee), employer: Math.round(rule.employer) };
}

// ---------------------------------------------------------------- salary structure

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const r = Math.round;
const up = Math.ceil;

export interface SalaryInput {
  annualCtc: number;
  /** Basic as a share of gross, for example 0.5. */
  basicShare: number;
  /** HRA is the policy's metro share of Basic in the four metros, the other share elsewhere. */
  metro: boolean;
}

export interface Structure {
  ctcMonthly: number;
  gross: number;
  basic: number;
  hra: number;
  allowances: { key: string; label: string; amount: number }[];
  special: number;
  /** Code on Wages "wages" for the full month (Basic, topped up to the policy share of gross). */
  wages: number;
  esiApplies: boolean;
}

/** Code on Wages s.2(y): exclusions beyond the share of total pay are added back to wages. */
export function statutoryWages(basic: number, gross: number, p: PayrollPolicy) {
  return p.labourCodeWages.enabled
    ? Math.max(basic, r(gross * p.labourCodeWages.minimumShare))
    : basic;
}

function pfBase(wages: number, p: PayrollPolicy) {
  return p.pf.restrictToCeiling ? Math.min(wages, p.pf.wageCeiling) : wages;
}

/**
 * Full-month components from CTC. Employer PF and ESI sit inside CTC (per policy), and both
 * depend on gross, so gross is solved for: without ESI first, then with it when gross ends up
 * at or under the ESI ceiling.
 */
export function structure(s: SalaryInput, p: PayrollPolicy): Structure {
  const ctc = s.annualCtc / 12;
  const solve = (withEsi: boolean) => {
    let gross = ctc;
    for (let i = 0; i < 30; i++) {
      const wages = statutoryWages(gross * s.basicShare, gross, p);
      const employerPf =
        p.pf.enabled && p.pf.employerInCtc ? pfBase(wages, p) * p.pf.employerRate : 0;
      gross = ctc - employerPf - (withEsi ? gross * p.esi.employerRate : 0);
    }
    return r(gross);
  };
  let gross = solve(false);
  const esiApplies = p.esi.enabled && gross <= p.esi.wageCeiling;
  if (esiApplies) gross = solve(true);
  const basic = r(gross * s.basicShare);
  const hra = r(
    (basic * (s.metro ? p.components.hraMetroPercent : p.components.hraNonMetroPercent)) / 100,
  );
  // Fixed allowances are paid only as far as gross allows; Special takes whatever is left.
  let room = Math.max(0, gross - basic - hra);
  const allowances = p.components.fixedAllowances.map((a) => {
    const amount = Math.min(a.monthly, room);
    room -= amount;
    return { key: a.key, label: a.label, amount };
  });
  return {
    ctcMonthly: r(ctc),
    gross,
    basic,
    hra,
    allowances,
    special: room,
    wages: statutoryWages(basic, gross, p),
    esiApplies,
  };
}

/** Days-weighted blend of two or more structures, for a salary change in the middle of a month. */
export function blend(parts: { structure: Structure; days: number }[]): Structure {
  const total = parts.reduce((n, x) => n + x.days, 0) || 1;
  const w = (f: (s: Structure) => number) =>
    r(parts.reduce((n, x) => n + f(x.structure) * x.days, 0) / total);
  const last = parts[parts.length - 1]!.structure;
  const allowances = last.allowances.map((a) => ({
    ...a,
    amount: w((s) => s.allowances.find((x) => x.key === a.key)?.amount ?? 0),
  }));
  const gross = w((s) => s.gross);
  const basic = w((s) => s.basic);
  const hra = w((s) => s.hra);
  return {
    ctcMonthly: w((s) => s.ctcMonthly),
    gross,
    basic,
    hra,
    allowances,
    special: gross - basic - hra - allowances.reduce((n, a) => n + a.amount, 0),
    wages: w((s) => s.wages),
    esiApplies: parts.some((x) => x.structure.esiApplies),
  };
}

// ---------------------------------------------------------------- the month

export interface PayItem {
  label: string;
  amount: number;
  kind: 'earning' | 'deduction';
  /** Earnings: counts toward taxable income. */
  taxable: boolean;
  /** Earnings: tax-free part (gratuity, leave encashment at exit, within limits). */
  exempt: number;
  /** Earnings: part that counts as PF wages (e.g. Basic arrears). */
  pfWages: number;
  /** Earnings: counts toward ESI wages and professional tax gross. */
  esiWages: boolean;
}

export interface Declaration {
  rentMonthly: number;
  sec80C: number;
  sec80D: number;
  sec80DParents: number;
  parentsSenior: boolean;
  sec80CCD1B: number;
  homeLoanInterest: number;
  otherDeductions: number;
  previousEmployerIncome: number;
  previousEmployerTds: number;
}

export const NO_DECLARATION: Declaration = {
  rentMonthly: 0,
  sec80C: 0,
  sec80D: 0,
  sec80DParents: 0,
  parentsSenior: false,
  sec80CCD1B: 0,
  homeLoanInterest: 0,
  otherDeductions: 0,
  previousEmployerIncome: 0,
  previousEmployerTds: 0,
};

export interface TaxContext {
  regime: Regime;
  age: number;
  /** From earlier payslips this financial year. */
  ytd: { taxable: number; tds: number; pt: number; pf: number; months: number };
  /** Salary months left in the financial year after this one (0 in March or a leaver's last month). */
  monthsAfter: number;
  declaration: Declaration;
}

export interface MonthInput {
  month: string;
  full: Structure;
  metro: boolean;
  /** Calendar days employed this month (joining or leaving mid-month). */
  daysEmployed: number;
  /** Unpaid days: absences, unpaid leave and late-mark penalties, half days as 0.5. */
  lopDays: number;
  overtimeHours: number;
  reimbursements: number;
  items: PayItem[];
  state: string | null;
  /** ESI coverage, including staying covered for the rest of a contribution period. */
  esiCovered: boolean;
  tax: TaxContext;
}

export interface Line {
  key: string;
  label: string;
  amount: number;
  kind: 'earning' | 'deduction' | 'employer';
}

export interface Payslip {
  lines: Line[];
  fullGross: number;
  gross: number;
  taxableIncome: number;
  deductions: number;
  net: number;
  ctcMonthly: number;
  pf: number;
  employerPf: number;
  eps: number;
  edli: number;
  pfAdmin: number;
  pfWages: number;
  epsWages: number;
  esi: number;
  employerEsi: number;
  esiWages: number;
  pt: number;
  lwf: number;
  employerLwf: number;
  tds: number;
  annualTax: number;
  bonus: number;
  overtimePay: number;
  reimbursements: number;
  esiApplies: boolean;
  payableDays: number;
  daysInMonth: number;
}

/** Share of the month's salary earned, by the policy's day-count basis. */
export function earnedShare(
  dim: number,
  daysEmployed: number,
  lopDays: number,
  basis: PayrollPolicy['lopBasis'],
) {
  const fullMonth = daysEmployed >= dim;
  if (basis === 'FIXED_30')
    return Math.max(0, Math.min(1, ((fullMonth ? 30 : Math.min(daysEmployed, 30)) - lopDays) / 30));
  // A 26-day month only makes sense for full months; part months prorate by calendar days.
  if (basis === 'FIXED_26' && fullMonth) return Math.max(0, (26 - lopDays) / 26);
  return Math.max(0, Math.min(1, (Math.min(dim, daysEmployed) - lopDays) / dim));
}

/** HRA exemption, s.10(13A) with rule 2A: the least of HRA, rent less 10% of Basic, and 50%/40% of Basic. */
export function hraExemption(hra: number, basic: number, rent: number, metro: boolean) {
  if (rent <= 0) return 0;
  return Math.max(0, Math.min(hra, rent - 0.1 * basic, basic * (metro ? 0.5 : 0.4)));
}

export function calculate(m: MonthInput, p: PayrollPolicy): Payslip {
  const full = m.full;
  const dim = daysInMonth(m.month);
  const share = earnedShare(dim, m.daysEmployed, m.lopDays, p.lopBasis);
  const payableDays = Math.max(0, Math.min(dim, m.daysEmployed) - m.lopDays);

  // ---- earnings
  const basic = r(full.basic * share);
  const hra = r(full.hra * share);
  const allowances = full.allowances.map((a) => ({ ...a, amount: r(a.amount * share) }));
  const special = r(full.special * share);
  const regular = basic + hra + special + allowances.reduce((n, a) => n + a.amount, 0);

  // Factories Act s.59: ordinary rate of wages per hour, times the multiplier.
  const hourlyBase = p.overtime.basis === 'BASIC' ? full.basic : full.gross;
  const overtimePay = r(
    (m.overtimeHours * hourlyBase * p.overtime.multiplier) /
      p.overtime.divisorDays /
      p.overtime.hoursPerDay,
  );

  const earnItems = m.items.filter((i) => i.kind === 'earning');
  const dedItems = m.items.filter((i) => i.kind === 'deduction');

  // Payment of Bonus Act s.10/12, paid monthly when the policy says so.
  const bonusEligible = p.bonus.enabled && full.wages <= p.bonus.eligibilityCeiling;
  const bonus =
    bonusEligible && p.bonus.payout === 'MONTHLY'
      ? r(
          p.bonus.rate *
            Math.min(statutoryWages(basic, regular, p), p.bonus.calculationCeiling) *
            (share > 0 ? 1 : 0),
        )
      : 0;

  const gross = regular + overtimePay + bonus + earnItems.reduce((n, i) => n + i.amount, 0);

  // ---- PF (EPF Scheme para 29, EPS para 3, EDLI para 8)
  const wagesEarned =
    statutoryWages(basic, regular, p) + earnItems.reduce((n, i) => n + i.pfWages, 0);
  const pfWages = p.pf.enabled ? pfBase(wagesEarned, p) : 0;
  const epsWages = p.pf.enabled ? Math.min(wagesEarned, p.pf.wageCeiling) : 0;
  const pf = r(pfWages * p.pf.employeeRate);
  const employerPf = r(pfWages * p.pf.employerRate);
  const eps = Math.min(employerPf, r(epsWages * p.pf.epsRate));
  const edli = r(epsWages * p.pf.edliRate);
  const pfAdmin = r(pfWages * p.pf.adminRate);

  // ---- ESI: wages include overtime and other wage items, not bonus or exempt payouts.
  const esiWages = m.esiCovered
    ? regular + overtimePay + earnItems.filter((i) => i.esiWages).reduce((n, i) => n + i.amount, 0)
    : 0;
  const esi = m.esiCovered ? up(esiWages * p.esi.employeeRate) : 0;
  const employerEsi = m.esiCovered ? up(esiWages * p.esi.employerRate) : 0;

  // ---- state levies
  const ptGross =
    regular + overtimePay + earnItems.filter((i) => i.esiWages).reduce((n, i) => n + i.amount, 0);
  const pt = p.professionalTax && payableDays > 0 ? professionalTax(m.state, ptGross, m.month) : 0;
  const lwf =
    p.labourWelfareFund && payableDays > 0
      ? labourWelfareFund(m.state, m.month)
      : { employee: 0, employer: 0 };

  // ---- income tax (s.192): estimate the year, deduct what's left evenly over the months left.
  const taxableThisMonth =
    regular +
    overtimePay +
    bonus +
    earnItems
      .filter((i) => i.taxable)
      .reduce((n, i) => n + i.amount - Math.min(i.exempt, i.amount), 0);
  const t = m.tax;
  const months = t.ytd.months + 1 + t.monthsAfter;
  const projectedGross =
    t.ytd.taxable +
    taxableThisMonth +
    full.gross * t.monthsAfter +
    t.declaration.previousEmployerIncome;
  let deductions: number;
  if (t.regime === 'NEW') {
    deductions = Math.min(NEW_REGIME.standardDeduction, projectedGross);
  } else {
    const L = OLD_REGIME.limits;
    const d = t.declaration;
    const annualPt = t.ytd.pt + pt + professionalTax(m.state, full.gross, m.month) * t.monthsAfter;
    const annualPf = t.ytd.pf + pf + r(pfBase(full.wages, p) * p.pf.employeeRate) * t.monthsAfter;
    const hraExempt = hraExemption(
      full.hra * months,
      full.basic * months,
      d.rentMonthly * months,
      m.metro,
    );
    deductions =
      Math.min(OLD_REGIME.standardDeduction, projectedGross) +
      annualPt +
      hraExempt +
      Math.min(L.sec80C, d.sec80C + annualPf) +
      Math.min(t.age >= 60 ? L.sec80DSenior : L.sec80D, d.sec80D) +
      Math.min(d.parentsSenior ? L.sec80DSenior : L.sec80D, d.sec80DParents) +
      Math.min(L.sec80CCD1B, d.sec80CCD1B) +
      Math.min(L.homeLoanInterest, d.homeLoanInterest) +
      d.otherDeductions;
  }
  const annualTaxable = Math.max(0, projectedGross - deductions);
  const annualTax = incomeTax(annualTaxable, t.regime, t.age);
  const leftToDeduct = Math.max(0, annualTax - t.ytd.tds - t.declaration.previousEmployerTds);
  const tds = payableDays > 0 || gross > 0 ? r(leftToDeduct / (t.monthsAfter + 1)) : 0;

  // ---- totals
  const otherDeductions = dedItems.reduce((n, i) => n + i.amount, 0);
  const deductionsTotal = pf + esi + pt + lwf.employee + tds + otherDeductions;
  const beforeRounding = gross - deductionsTotal + m.reimbursements;
  const rounded = p.rounding === 'TEN' ? Math.round(beforeRounding / 10) * 10 : beforeRounding;
  const roundOff = rounded - beforeRounding;

  const raw: Line[] = [
    { key: 'basic', label: 'Basic', amount: basic, kind: 'earning' },
    { key: 'hra', label: 'House rent allowance', amount: hra, kind: 'earning' },
    ...allowances
      .filter((a) => a.amount)
      .map((a) => ({ key: a.key, label: a.label, amount: a.amount, kind: 'earning' as const })),
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
    ...(bonus
      ? [{ key: 'bonus', label: 'Statutory bonus', amount: bonus, kind: 'earning' as const }]
      : []),
    ...earnItems.map((i, n) => ({
      key: `item_e${n}`,
      label: i.label,
      amount: i.amount,
      kind: 'earning' as const,
    })),
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
    ...(pf ? [{ key: 'pf', label: 'Provident fund', amount: pf, kind: 'deduction' as const }] : []),
    ...(esi ? [{ key: 'esi', label: 'ESI', amount: esi, kind: 'deduction' as const }] : []),
    ...(pt
      ? [{ key: 'pt', label: 'Professional tax', amount: pt, kind: 'deduction' as const }]
      : []),
    ...(lwf.employee
      ? [
          {
            key: 'lwf',
            label: 'Labour welfare fund',
            amount: lwf.employee,
            kind: 'deduction' as const,
          },
        ]
      : []),
    ...(tds
      ? [
          {
            key: 'tds',
            label: `Income tax (TDS, ${t.regime === 'NEW' ? 'new' : 'old'} regime)`,
            amount: tds,
            kind: 'deduction' as const,
          },
        ]
      : []),
    ...dedItems.map((i, n) => ({
      key: `item_d${n}`,
      label: i.label,
      amount: i.amount,
      kind: 'deduction' as const,
    })),
    ...(roundOff
      ? [
          {
            key: 'round_off',
            label: 'Rounding',
            amount: roundOff,
            kind: roundOff > 0 ? ('earning' as const) : ('deduction' as const),
          },
        ]
      : []),
    ...(employerPf
      ? [
          {
            key: 'employer_pf',
            label: 'Employer PF (EPF + EPS)',
            amount: employerPf,
            kind: 'employer' as const,
          },
        ]
      : []),
    ...(edli ? [{ key: 'edli', label: 'EDLI', amount: edli, kind: 'employer' as const }] : []),
    ...(pfAdmin
      ? [{ key: 'pf_admin', label: 'PF admin charges', amount: pfAdmin, kind: 'employer' as const }]
      : []),
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
    ...(lwf.employer
      ? [
          {
            key: 'employer_lwf',
            label: 'Employer LWF',
            amount: lwf.employer,
            kind: 'employer' as const,
          },
        ]
      : []),
  ];
  const lines = raw.map((l) => (l.key === 'round_off' ? { ...l, amount: Math.abs(l.amount) } : l));

  return {
    lines,
    fullGross: full.gross,
    gross,
    taxableIncome: taxableThisMonth,
    deductions: deductionsTotal,
    net: rounded,
    ctcMonthly: full.ctcMonthly,
    pf,
    employerPf,
    eps,
    edli,
    pfAdmin,
    pfWages,
    epsWages,
    esi,
    employerEsi,
    esiWages,
    pt,
    lwf: lwf.employee,
    employerLwf: lwf.employer,
    tds,
    annualTax,
    bonus,
    overtimePay,
    reimbursements: m.reimbursements,
    esiApplies: m.esiCovered,
    payableDays,
    daysInMonth: dim,
  };
}

// ---------------------------------------------------------------- leavers

/**
 * Gratuity, Payment of Gratuity Act s.4: 15 days' wages (last wages ÷ 26) per completed year of
 * service, a final part-year of more than six months counting as a year, capped by s.4(3).
 * Due after five years, or a year for fixed-term staff (Code on Social Security s.53), or at
 * once on death or disablement.
 */
export function gratuity(
  lastMonthlyWages: number,
  joined: string,
  lastDay: string,
  p: PayrollPolicy,
  opts: { fixedTerm: boolean; deathOrDisablement: boolean },
) {
  const ms = Date.parse(lastDay) - Date.parse(joined);
  const exactYears = ms / (365.25 * 86_400_000);
  let years = Math.floor(exactYears);
  if (exactYears - years > 0.5) years += 1;
  const minimum = opts.fixedTerm ? p.gratuity.fixedTermMinYears : p.gratuity.minYears;
  // Courts have read s.2A's "continuous service" so that 4 years and 240 days counts as five.
  const eligible =
    opts.deathOrDisablement ||
    exactYears >= minimum ||
    (minimum === 5 && exactYears >= 4 + 240 / 365);
  const amount = eligible
    ? Math.min(
        p.gratuity.cap,
        r((lastMonthlyWages * p.gratuity.daysPerYear * years) / p.gratuity.divisor),
      )
    : 0;
  return { eligible, years, exactYears: Math.round(exactYears * 100) / 100, amount };
}
