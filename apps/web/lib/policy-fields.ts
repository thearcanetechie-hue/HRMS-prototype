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
  key: 'attendance' | 'leave' | 'payroll' | 'security';
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
  {
    key: 'payroll',
    title: 'Payroll',
    permission: 'payroll.manage',
    groups: [
      {
        title: 'Salary structure and days',
        description:
          'Basic is set per person with their salary; Special allowance takes the balance.',
        fields: [
          {
            path: 'components.hraMetroPercent',
            type: 'number',
            label: 'HRA in metro cities',
            min: 0,
            max: 100,
            unit: '% of Basic',
          },
          {
            path: 'components.hraNonMetroPercent',
            type: 'number',
            label: 'HRA elsewhere',
            min: 0,
            max: 100,
            unit: '% of Basic',
          },
          {
            path: 'lopBasis',
            type: 'select',
            label: 'A day’s pay is the month’s pay divided by',
            help: 'Used for unpaid days and part months.',
            options: [
              ['CALENDAR', 'Days in the month'],
              ['FIXED_30', '30'],
              ['FIXED_26', '26 (full months)'],
            ],
          },
          {
            path: 'rounding',
            type: 'select',
            label: 'Round net pay to',
            options: [
              ['RUPEE', 'The nearest rupee'],
              ['TEN', 'The nearest ₹ 10'],
            ],
          },
        ],
      },
      {
        title: 'Wages under the Labour Codes',
        description:
          'Code on Wages s.2(y): allowances over half of pay count as wages for PF, gratuity and bonus.',
        fields: [
          { path: 'labourCodeWages.enabled', type: 'toggle', label: 'Apply the 50% wage rule' },
          {
            path: 'labourCodeWages.minimumShare',
            type: 'number',
            label: 'Wages are at least',
            percent: true,
            min: 0,
            max: 100,
            unit: '% of pay',
          },
        ],
      },
      {
        title: 'Provident fund (EPF, EPS, EDLI)',
        fields: [
          { path: 'pf.enabled', type: 'toggle', label: 'Deduct PF' },
          {
            path: 'pf.restrictToCeiling',
            type: 'toggle',
            label: 'Contribute on wages up to the ceiling only',
            help: 'Off contributes on full wages.',
          },
          {
            path: 'pf.wageCeiling',
            type: 'number',
            label: 'Wage ceiling',
            min: 0,
            unit: '₹ a month',
          },
          {
            path: 'pf.employeeRate',
            type: 'number',
            label: 'Employee share',
            percent: true,
            min: 0,
            max: 20,
            step: 0.01,
            unit: '%',
          },
          {
            path: 'pf.employerRate',
            type: 'number',
            label: 'Employer share',
            percent: true,
            min: 0,
            max: 20,
            step: 0.01,
            unit: '%',
          },
          { path: 'pf.employerInCtc', type: 'toggle', label: 'Employer PF is part of CTC' },
        ],
      },
      {
        title: 'ESI, professional tax and LWF',
        description: 'PT and LWF follow the state of each person’s work location.',
        fields: [
          { path: 'esi.enabled', type: 'toggle', label: 'Deduct ESI' },
          {
            path: 'esi.wageCeiling',
            type: 'number',
            label: 'ESI applies up to',
            min: 0,
            unit: '₹ gross a month',
          },
          { path: 'professionalTax', type: 'toggle', label: 'Deduct professional tax' },
          { path: 'labourWelfareFund', type: 'toggle', label: 'Deduct labour welfare fund' },
        ],
      },
      {
        title: 'Overtime',
        description: 'Factories Act s.59: twice the ordinary rate of wages.',
        fields: [
          {
            path: 'overtime.multiplier',
            type: 'number',
            label: 'Pay overtime at',
            min: 1,
            max: 4,
            step: 0.5,
            unit: '× the hourly rate',
          },
          {
            path: 'overtime.basis',
            type: 'select',
            label: 'Hourly rate from',
            options: [
              ['GROSS', 'Gross pay'],
              ['BASIC', 'Basic'],
            ],
          },
          {
            path: 'overtime.divisorDays',
            type: 'number',
            label: 'Working days a month',
            min: 1,
            max: 31,
            unit: 'days',
          },
          {
            path: 'overtime.hoursPerDay',
            type: 'number',
            label: 'Hours a day',
            min: 1,
            max: 12,
            unit: 'hours',
          },
        ],
      },
      {
        title: 'Income tax and bonus',
        fields: [
          {
            path: 'tds.defaultRegime',
            type: 'select',
            label: 'Regime when someone hasn’t chosen',
            options: [
              ['NEW', 'New regime (s.115BAC default)'],
              ['OLD', 'Old regime'],
            ],
          },
          { path: 'bonus.enabled', type: 'toggle', label: 'Pay statutory bonus' },
          {
            path: 'bonus.rate',
            type: 'number',
            label: 'Bonus rate',
            percent: true,
            min: 8.33,
            max: 20,
            step: 0.01,
            unit: '% (8.33 to 20)',
          },
          {
            path: 'bonus.payout',
            type: 'select',
            label: 'Pay bonus',
            options: [
              ['ANNUAL', 'Once a year'],
              ['MONTHLY', 'Monthly with salary'],
            ],
          },
        ],
      },
      {
        title: 'Leavers',
        fields: [
          {
            path: 'gratuity.minYears',
            type: 'number',
            label: 'Gratuity after',
            min: 0,
            max: 10,
            unit: 'years',
          },
          {
            path: 'gratuity.fixedTermMinYears',
            type: 'number',
            label: 'Fixed-term staff after',
            min: 0,
            max: 10,
            unit: 'years',
          },
          {
            path: 'gratuity.daysPerYear',
            type: 'number',
            label: 'Gratuity days per year',
            min: 15,
            max: 30,
            unit: 'days',
          },
          {
            path: 'notice.days',
            type: 'number',
            label: 'Notice period',
            min: 0,
            max: 180,
            unit: 'days',
          },
          {
            path: 'notice.basis',
            type: 'select',
            label: 'Notice pay on',
            options: [
              ['GROSS', 'Gross pay'],
              ['BASIC', 'Basic'],
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'security',
    title: 'Sign-in security',
    permission: 'tenant.manage',
    groups: [
      {
        title: 'Two-step sign-in',
        description: 'A code from an authenticator app after the password.',
        fields: [
          {
            path: 'mfaForAdmins',
            type: 'toggle',
            label: 'Require it for admins',
            help: 'Anyone who can manage the workspace, employees or payroll.',
          },
          { path: 'mfaForEveryone', type: 'toggle', label: 'Require it for everyone' },
        ],
      },
      {
        title: 'Wrong passwords',
        fields: [
          {
            path: 'lockout.attempts',
            type: 'number',
            label: 'Lock a login after',
            min: 3,
            max: 20,
            unit: 'wrong passwords in a row',
          },
          {
            path: 'lockout.minutes',
            type: 'number',
            label: 'For',
            min: 1,
            max: 1440,
            unit: 'minutes',
          },
        ],
      },
      {
        title: 'Sessions',
        fields: [
          {
            path: 'rememberDays',
            type: 'number',
            label: '“Keep me signed in” lasts',
            min: 1,
            max: 90,
            unit: 'days',
          },
          {
            path: 'sessionHours',
            type: 'number',
            label: 'Otherwise a session lasts',
            min: 1,
            max: 72,
            unit: 'hours',
          },
          {
            path: 'allowSso',
            type: 'toggle',
            label: 'Allow Google and Microsoft sign-in',
            help: 'When the server has them set up.',
          },
        ],
      },
    ],
  },
];
