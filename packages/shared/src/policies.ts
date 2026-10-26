import { z } from 'zod';

/**
 * Company policies HR can change without code. Each has a default that follows common Indian
 * practice; the API stores only what HR changed and fills in the rest from these defaults, so
 * new settings added later get sensible values automatically.
 */

export const attendancePolicySchema = z.object({
  /** Late check-ins: every N late marks in a month cost half a day's pay. Off by default. */
  latePenalty: z
    .object({
      enabled: z.boolean().default(false),
      latesPerHalfDay: z.number().int().min(1).max(31).default(3),
    })
    .default({}),
  /** What working days with no mark become when HR closes a month. */
  unmarkedDays: z.enum(['A', 'P']).default('A'),
  /** Missed-punch fixes: how far back, and how many a month (0 for no limit). */
  regularisation: z
    .object({
      windowDays: z.number().int().min(1).max(365).default(30),
      maxPerMonth: z.number().int().min(0).max(31).default(0),
    })
    .default({}),
  /** Comp-off for working on a weekly off or holiday: hours for half and full day credit. */
  compOff: z
    .object({
      enabled: z.boolean().default(true),
      halfDayHours: z.number().min(1).max(12).default(4),
      fullDayHours: z.number().min(1).max(16).default(8),
    })
    .default({}),
  /** Let people check in and out from the web app (devices always work). */
  webCheckIn: z.boolean().default(true),
});
export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;

export const leavePolicySchema = z.object({
  /** New joiners and leavers get yearly leave in proportion to the months they're employed. */
  prorateJoiners: z.boolean().default(true),
  prorateLeavers: z.boolean().default(true),
  /**
   * Sandwich rule: weekly offs and holidays between two days of leave count as leave. Common
   * in some Shops & Establishments practice; off by default.
   */
  sandwich: z.boolean().default(false),
  /** Encashment pay for one day = (basic, or gross) ÷ this. 26 is usual; 30 is also common. */
  encashment: z
    .object({
      basis: z.enum(['BASIC', 'GROSS']).default('BASIC'),
      divisor: z.number().int().min(1).max(31).default(26),
      /** Most days paid out at a year end (exit settlements pay the whole balance). */
      maxDaysPerYear: z.number().int().min(0).max(366).default(30),
    })
    .default({}),
});
export type LeavePolicy = z.infer<typeof leavePolicySchema>;

/**
 * Payroll policy. Statutory rates default to the law as we understand it for FY 2026-27 and
 * are editable so a change in the law, or a company choice the law allows, needs no code.
 * A chartered accountant must review these before real payroll.
 */
export const payrollPolicySchema = z.object({
  /** Salary structure: Basic is set per person; HRA is a share of Basic; Special balances to gross. */
  components: z
    .object({
      hraMetroPercent: z.number().min(0).max(100).default(50),
      hraNonMetroPercent: z.number().min(0).max(100).default(40),
      /** Fixed monthly allowances paid before Special allowance takes the balance. */
      fixedAllowances: z
        .array(
          z.object({
            key: z.string().regex(/^[a-z_]{2,30}$/),
            label: z.string().min(2).max(60),
            monthly: z.number().int().min(0).max(10_00_000),
          }),
        )
        .max(10)
        .default([]),
    })
    .default({}),
  /** How a day's pay is worked out for loss of pay and part months. */
  lopBasis: z.enum(['CALENDAR', 'FIXED_30', 'FIXED_26']).default('CALENDAR'),
  /**
   * Code on Wages, 2019 s.2(y) (in force from 21 Nov 2025): if allowances excluded from
   * "wages" go over 50% of total pay, the excess counts as wages. Used for PF, gratuity and bonus.
   */
  labourCodeWages: z
    .object({
      enabled: z.boolean().default(true),
      minimumShare: z.number().min(0).max(1).default(0.5),
    })
    .default({}),
  /** EPF & MP Act, 1952 and its schemes. */
  pf: z
    .object({
      enabled: z.boolean().default(true),
      employeeRate: z.number().min(0).max(0.2).default(0.12),
      employerRate: z.number().min(0).max(0.2).default(0.12),
      /** Pension (EPS) share of the employer's 12%, on wages up to the ceiling. */
      epsRate: z.number().min(0).max(0.2).default(0.0833),
      wageCeiling: z.number().int().min(0).default(15_000),
      /** Contribute on wages capped at the ceiling (common) or on full wages. */
      restrictToCeiling: z.boolean().default(true),
      edliRate: z.number().min(0).max(0.05).default(0.005),
      adminRate: z.number().min(0).max(0.05).default(0.005),
      /** Employer PF is part of CTC (so it reduces gross). */
      employerInCtc: z.boolean().default(true),
    })
    .default({}),
  /** ESI Act, 1948. */
  esi: z
    .object({
      enabled: z.boolean().default(true),
      employeeRate: z.number().min(0).max(0.05).default(0.0075),
      employerRate: z.number().min(0).max(0.1).default(0.0325),
      wageCeiling: z.number().int().min(0).default(21_000),
    })
    .default({}),
  professionalTax: z.boolean().default(true),
  labourWelfareFund: z.boolean().default(true),
  /** Factories Act, 1948 s.59: twice the ordinary rate of wages. */
  overtime: z
    .object({
      multiplier: z.number().min(1).max(4).default(2),
      basis: z.enum(['BASIC', 'GROSS']).default('GROSS'),
      divisorDays: z.number().int().min(1).max(31).default(26),
      hoursPerDay: z.number().min(1).max(12).default(8),
    })
    .default({}),
  tds: z
    .object({
      /** Section 115BAC: the new regime applies unless the person opts out. */
      defaultRegime: z.enum(['NEW', 'OLD']).default('NEW'),
    })
    .default({}),
  /** Payment of Bonus Act, 1965. */
  bonus: z
    .object({
      enabled: z.boolean().default(true),
      /** 8.33% minimum to 20% maximum. */
      rate: z.number().min(0.0833).max(0.2).default(0.0833),
      /** Only employees whose wages are at or under this are covered. */
      eligibilityCeiling: z.number().int().min(0).default(21_000),
      /** Bonus is worked out on wages up to this, or the minimum wage if higher. */
      calculationCeiling: z.number().int().min(0).default(7_000),
      /** Pay monthly with salary, or once a year (added from the Payroll screen). */
      payout: z.enum(['ANNUAL', 'MONTHLY']).default('ANNUAL'),
    })
    .default({}),
  /** Payment of Gratuity Act, 1972 s.4, and Code on Social Security s.53 for fixed-term staff. */
  gratuity: z
    .object({
      daysPerYear: z.number().int().min(15).max(30).default(15),
      divisor: z.number().int().min(26).max(30).default(26),
      minYears: z.number().min(0).max(10).default(5),
      fixedTermMinYears: z.number().min(0).max(10).default(1),
      /** Tax-free and statutory maximum. */
      cap: z.number().int().min(0).default(20_00_000),
    })
    .default({}),
  /** Notice pay when someone leaves without serving their full notice. */
  notice: z
    .object({
      days: z.number().int().min(0).max(180).default(30),
      basis: z.enum(['BASIC', 'GROSS']).default('GROSS'),
    })
    .default({}),
  /** Round net pay to the nearest rupee or ten rupees. */
  rounding: z.enum(['RUPEE', 'TEN']).default('RUPEE'),
});
export type PayrollPolicy = z.infer<typeof payrollPolicySchema>;

/** Form 12BB declaration for a financial year (starting April of `fyStart`). */
export const taxDeclarationSchema = z.object({
  employeeId: z.string().uuid().optional(),
  fyStart: z.number().int().min(2000).max(2100),
  regime: z.enum(['NEW', 'OLD']),
  /** Rent paid a month, for the HRA exemption (old regime). */
  rentMonthly: z.number().int().min(0).max(10_00_000).default(0),
  /** Needed when rent is over ₹ 1 lakh a year. */
  landlordPan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Use a PAN like ABCDE1234F')
    .nullish()
    .or(z.literal('')),
  /** Section 80C investments besides employee PF (which is counted automatically). */
  sec80C: z.number().int().min(0).max(10_00_000).default(0),
  /** Health insurance: self and family, and parents. */
  sec80D: z.number().int().min(0).max(1_00_000).default(0),
  sec80DParents: z.number().int().min(0).max(1_00_000).default(0),
  parentsSenior: z.boolean().default(false),
  /** Own NPS contribution beyond 80C. */
  sec80CCD1B: z.number().int().min(0).max(1_00_000).default(0),
  /** Home loan interest on a self-occupied house, section 24(b). */
  homeLoanInterest: z.number().int().min(0).max(50_00_000).default(0),
  /** Other Chapter VI-A deductions (80E, 80G, 80TTA...), as allowed. */
  otherDeductions: z.number().int().min(0).max(50_00_000).default(0),
  /** Income and TDS from an earlier employer this year (Form 12B). */
  previousEmployerIncome: z.number().int().min(0).max(10_00_00_000).default(0),
  previousEmployerTds: z.number().int().min(0).max(10_00_00_000).default(0),
});
export type TaxDeclarationInput = z.infer<typeof taxDeclarationSchema>;

export const PAY_ITEM_KINDS = [
  'BONUS',
  'INCENTIVE',
  'ARREARS',
  'OTHER_EARNING',
  'ADVANCE_RECOVERY',
  'LOAN_RECOVERY',
  'OTHER_DEDUCTION',
] as const;
export const payItemSchema = z.object({
  employeeId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  kind: z.enum(PAY_ITEM_KINDS),
  label: z.string().trim().min(2).max(80),
  amount: z.number().int().min(1).max(1_00_00_000),
  /** Earnings only: counts as taxable income. */
  taxable: z.boolean().default(true),
  /** Tax-free part of an earning (e.g. gratuity or leave encashment at exit, within limits). */
  exempt: z.number().int().min(0).default(0),
  note: z.string().trim().max(300).nullish(),
});
export type PayItemInput = z.infer<typeof payItemSchema>;

export const settlementSchema = z.object({
  employeeId: z.string().uuid(),
  lastWorkingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Notice days actually served; shortfall against policy is recovered, extra waived. */
  noticeServedDays: z.number().int().min(0).max(366),
  /** Waive notice recovery (common when the company asks someone to leave early). */
  waiveNoticeRecovery: z.boolean().default(false),
  /** Fixed-term employees qualify for gratuity after a year. */
  fixedTerm: z.boolean().default(false),
  /** Death or disablement: gratuity is due without the five-year minimum. */
  deathOrDisablement: z.boolean().default(false),
});
export type SettlementInput = z.infer<typeof settlementSchema>;

/** Sign-in security for the workspace. */
export const securityPolicySchema = z.object({
  /** Wrong passwords in a row before the login is locked, and for how long. */
  lockout: z
    .object({
      attempts: z.number().int().min(3).max(20).default(5),
      minutes: z.number().int().min(1).max(1440).default(15),
    })
    .default({}),
  /** Require two-step sign-in for people who can manage the workspace, HR or payroll. */
  mfaForAdmins: z.boolean().default(false),
  /** Require it for everyone. */
  mfaForEveryone: z.boolean().default(false),
  /** How long "Keep me signed in" lasts. */
  rememberDays: z.number().int().min(1).max(90).default(30),
  /** How long a session lasts without "Keep me signed in". */
  sessionHours: z.number().int().min(1).max(72).default(12),
  /** Allow Google and Microsoft sign-in (when the server has them set up). */
  allowSso: z.boolean().default(true),
});
export type SecurityPolicy = z.infer<typeof securityPolicySchema>;

export const POLICY_KEYS = ['attendance', 'leave', 'payroll', 'security'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];
