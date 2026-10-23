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

export const POLICY_KEYS = ['attendance', 'leave', 'payroll'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];
