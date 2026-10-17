/** Copy for the public landing page (screen 01), kept here so it is easy to edit. */

export const NAV_LINKS = ['Product', 'Modules', 'Pricing', 'Customers', 'Resources'];

export const HERO = {
  pill: 'Built for Indian companies · PF, ESI, PT, TDS ready',
  title: 'The HR platform your people will actually enjoy.',
  sub: 'Attendance, leave, payroll, documents, learning and engagement in one calm, premium workspace. Set up in an afternoon, not a quarter.',
  trust: ['14-day free trial', 'No card needed', 'Data stored in India'],
};

export const PREVIEW = {
  greeting: 'Good morning, Meera',
  stats: [
    ['128', 'Employees'],
    ['94%', 'Present today'],
    ['6', 'Leave requests'],
  ],
  week: [
    ['Mon', 88],
    ['Tue', 92],
    ['Wed', 95],
    ['Thu', 91],
    ['Fri', 97],
    ['Sat', 62],
  ] as [string, number][],
  leave: { name: 'Ananya Sharma', initials: 'AS', what: 'Sick leave, 20 – 21 Oct · 2 days' },
};

export const LOGOS = [
  'Kestrel Labs',
  'Northwind',
  'Saffron Retail',
  'Vayu Mobility',
  'Indigo Health',
  'Tarang Media',
];

export const MODULES: [icon: string, title: string, line: string][] = [
  ['users', 'Employee records', 'Profiles, IDs and history in one place'],
  ['clock', 'Attendance & leave', 'Biometric sync, shifts and leave rules'],
  ['wallet', 'Payroll & compliance', 'PF, ESI, PT and TDS calculated for you'],
  ['user-plus', 'On/offboarding', 'Checklists that run themselves'],
  ['target', 'Performance', 'Goals, reviews and workload'],
  ['graduation-cap', 'Learning', 'Courses, enrolments and progress'],
  ['folder', 'Documents', 'Scan, convert and find any file'],
  ['heart', 'Engagement', 'A feed your team wants to read'],
  ['inbox', 'Inbox', 'Internal messages and approvals'],
  ['receipt', 'Expenses', 'Claims, overtime and payouts'],
  ['briefcase', 'Assets', 'Laptops, cards and who holds them'],
  ['plug', 'Integrations', 'Teams, Meet, Zoom, Jira and more'],
];

export const PAYROLL = {
  eyebrow: 'Payroll & compliance',
  title: 'Payroll that closes in an afternoon',
  body: 'Attendance, overtime and approved claims flow straight into payroll. Statutory deductions are worked out, payslips go out, and challans are ready to file.',
  checks: [
    'PF, ESI, PT and TDS calculated per state',
    'Payslips emailed and in the employee app',
    'ECR, Form 16 and Form 24Q exports',
    'Bank transfer file for every major bank',
  ],
  card: {
    title: 'October 2026 payroll',
    caption: '128 employees · pay date 31 Oct',
    rows: [
      ['Gross pay', '₹ 1,12,40,000', 100],
      ['PF (employer + employee)', '₹ 10,84,320', 42],
      ['ESI', '₹ 1,26,500', 12],
      ['Professional tax', '₹ 25,600', 6],
      ['TDS', '₹ 9,62,180', 38],
    ] as [string, string, number][],
  },
};

export const STATS = [
  ['1,240+', 'Companies on HRMS'],
  ['2.1 lakh', 'Payslips every month'],
  ['3 min', 'Average leave approval'],
  ['99.95%', 'Uptime this year'],
];

export const PLANS = [
  {
    name: 'Starter',
    monthly: 99,
    yearly: 79,
    tagline: 'For teams finding their feet',
    features: ['Employee records', 'Attendance & leave', 'Documents', 'Up to 50 people'],
    cta: 'Start free trial',
  },
  {
    name: 'Growth',
    monthly: 186,
    yearly: 149,
    tagline: 'Everything most companies need',
    features: [
      'All of Starter',
      'Payroll & compliance',
      'Performance & learning',
      'Engagement feed & inbox',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    monthly: null,
    yearly: null,
    tagline: 'For large and multi-entity groups',
    features: [
      'All of Growth',
      'SSO and audit exports',
      'Custom integrations',
      'Dedicated success manager',
    ],
    cta: 'Talk to sales',
  },
];

export const FOOTER = {
  blurb: 'HR software for Indian companies. Made in Bengaluru.',
  columns: [
    ['Product', ['Modules', 'Pricing', 'Security', 'Changelog']],
    ['Company', ['About', 'Customers', 'Careers', 'Contact']],
    ['Resources', ['Help centre', 'Payroll guide', 'API docs', 'Status']],
  ] as [string, string[]][],
  legal: '© 2026 HRMS Technologies Pvt Ltd',
  links: 'Privacy · Terms · DPDP compliance',
};
