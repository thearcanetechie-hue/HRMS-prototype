import type { TemplateTaskInput } from '@hrms/shared';

/**
 * Checklists every workspace starts with, written for Indian companies. HR can rename, reorder
 * or replace any task. Due dates count from the joining date (onboarding) or the last working
 * day (offboarding).
 */
export const DEFAULT_TEMPLATES: {
  name: string;
  kind: 'ONBOARDING' | 'OFFBOARDING';
  tasks: TemplateTaskInput[];
}[] = [
  {
    name: 'Standard onboarding',
    kind: 'ONBOARDING',
    tasks: [
      {
        title: 'Send the offer letter and collect the signed copy',
        assignee: 'HR',
        dueOffsetDays: -7,
        documentCategory: 'Offer letter',
      },
      {
        title: 'Create work email and system accounts',
        assignee: 'IT',
        dueOffsetDays: -1,
      },
      {
        title: 'Get the laptop, ID card and access card ready',
        assignee: 'IT',
        dueOffsetDays: -1,
      },
      {
        title: 'Upload Aadhaar card',
        description: 'A clear scan or photo of the front and back.',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 0,
        documentCategory: 'Aadhaar card',
      },
      {
        title: 'Upload PAN card',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 0,
        documentCategory: 'PAN card',
      },
      {
        title: 'Upload a cancelled cheque or bank statement',
        description: 'Used to set up salary payments.',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 0,
        documentCategory: 'Bank proof',
      },
      {
        title: 'Fill in personal details, bank account and emergency contact',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 1,
      },
      {
        title: 'Introduce the team and assign an onboarding buddy',
        assignee: 'MANAGER',
        dueOffsetDays: 0,
      },
      {
        title: 'Agree a 30-60-90 day plan',
        assignee: 'MANAGER',
        dueOffsetDays: 7,
      },
      {
        title: 'Verify documents and add to PF and ESI',
        description: 'Link the UAN, or generate one, and register for ESI if eligible.',
        assignee: 'HR',
        dueOffsetDays: 7,
      },
      {
        title: 'Complete POSH awareness training',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 14,
      },
      {
        title: 'Probation review',
        assignee: 'MANAGER',
        dueOffsetDays: 90,
      },
    ],
  },
  {
    name: 'Standard offboarding',
    kind: 'OFFBOARDING',
    tasks: [
      {
        title: 'Accept the resignation and confirm the last working day',
        assignee: 'HR',
        dueOffsetDays: -30,
      },
      {
        title: 'Plan and complete the knowledge handover',
        assignee: 'MANAGER',
        dueOffsetDays: -7,
      },
      {
        title: 'Exit interview',
        assignee: 'HR',
        dueOffsetDays: -2,
      },
      {
        title: 'Return laptop, ID card and access card',
        assignee: 'EMPLOYEE',
        dueOffsetDays: 0,
      },
      {
        title: 'Turn off email and system access',
        assignee: 'IT',
        dueOffsetDays: 0,
      },
      {
        title: 'Issue the relieving and experience letters',
        assignee: 'HR',
        dueOffsetDays: 0,
        documentCategory: 'Relieving letter',
      },
      {
        title: 'Settle full and final pay',
        description: 'Salary to the last day, leave encashment, gratuity if due, less recoveries.',
        assignee: 'HR',
        dueOffsetDays: 2,
      },
      {
        title: 'Share PF transfer and Form 16 guidance',
        assignee: 'HR',
        dueOffsetDays: 30,
      },
    ],
  },
];
