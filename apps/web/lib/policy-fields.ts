import type { Permission } from '@hrms/shared';

/** One editable setting on the Policies screen, addressed by its path in the policy object. */
export type PolicyField = { path: string; label: string; help?: string } & (
  | { type: 'toggle' }
  | { type: 'select'; options: [string, string][] }
  | { type: 'list' }
  | {
      type: 'number';
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      /** Stored as a fraction (0.12), shown as a percentage (12). */
      percent?: boolean;
      nullable?: boolean;
    }
);

export interface PolicySection {
  key: 'attendance' | 'leave' | 'payroll';
  title: string;
  permission: Permission;
  groups: { title: string; description?: string; fields: PolicyField[] }[];
}

export const POLICY_SECTIONS: PolicySection[] = [
  {
    key: 'attendance',
    title: 'Attendance',
    permission: 'attendance.manage',
    groups: [
      {
        title: 'Check-in and lateness',
        description: 'Start times and grace minutes are set per shift on the Attendance screen.',
        fields: [
          {
            path: 'webCheckIn',
            type: 'toggle',
            label: 'Check in from the web app',
            help: 'Turn off if you only use biometric devices.',
          },
          {
            path: 'latePenalty.enabled',
            type: 'toggle',
            label: 'Late marks cost pay',
            help: 'Repeated late check-ins in a month turn into unpaid half days.',
          },
          {
            path: 'latePenalty.latesPerHalfDay',
            type: 'number',
            label: 'Late marks for half a day',
            min: 1,
            max: 31,
            unit: 'lates',
          },
        ],
      },
      {
        title: 'Month close and fixes',
        fields: [
          {
            path: 'unmarkedDays',
            type: 'select',
            label: 'Unmarked working days at month close',
            options: [
              ['A', 'Absent (unpaid)'],
              ['P', 'Present'],
            ],
          },
          {
            path: 'regularisation.windowDays',
            type: 'number',
            label: 'Fix a missed punch up to',
            min: 1,
            max: 365,
            unit: 'days back',
          },
          {
            path: 'regularisation.maxPerMonth',
            type: 'number',
            label: 'Fixes allowed a month',
            help: '0 means no limit.',
            min: 0,
            max: 31,
          },
        ],
      },
      {
        title: 'Comp-off',
        description: 'Earned by working on a weekly off or holiday, into the comp-off leave type.',
        fields: [
          { path: 'compOff.enabled', type: 'toggle', label: 'Give comp-off for work on days off' },
          {
            path: 'compOff.halfDayHours',
            type: 'number',
            label: 'Hours for half a day',
            min: 1,
            max: 12,
            step: 0.5,
            unit: 'hours',
          },
          {
            path: 'compOff.fullDayHours',
            type: 'number',
            label: 'Hours for a full day',
            min: 1,
            max: 16,
            step: 0.5,
            unit: 'hours',
          },
        ],
      },
    ],
  },
  {
    key: 'leave',
    title: 'Leave',
    permission: 'attendance.manage',
    groups: [
      {
        title: 'Entitlement',
        description: 'Days per year, accrual and carry-forward are set per leave type.',
        fields: [
          {
            path: 'prorateJoiners',
            type: 'toggle',
            label: 'Prorate for new joiners',
            help: 'Yearly leave in proportion to months worked in the joining year.',
          },
          { path: 'prorateLeavers', type: 'toggle', label: 'Prorate for leavers' },
          {
            path: 'sandwich',
            type: 'toggle',
            label: 'Sandwich rule',
            help: 'Weekly offs and holidays between two days of leave count as leave.',
          },
        ],
      },
      {
        title: 'Encashment',
        description: 'For leave types marked as encashable, at year end or when someone leaves.',
        fields: [
          {
            path: 'encashment.basis',
            type: 'select',
            label: 'Pay a day of encashment on',
            options: [
              ['BASIC', 'Basic'],
              ['GROSS', 'Gross pay'],
            ],
          },
          {
            path: 'encashment.divisor',
            type: 'number',
            label: 'Divided by',
            help: '26 is usual; some companies use 30.',
            min: 1,
            max: 31,
            unit: 'days',
          },
          {
            path: 'encashment.maxDaysPerYear',
            type: 'number',
            label: 'Most days encashed at year end',
            min: 0,
            max: 366,
            unit: 'days',
          },
        ],
      },
    ],
  },
];
