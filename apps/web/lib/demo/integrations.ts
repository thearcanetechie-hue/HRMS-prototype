import type { Tone } from '@/components/ui/tone';
import { demoDelay } from '@/lib/format';

export type Integration = {
  id: string;
  name: string;
  category: 'Meetings' | 'Work tracking' | 'Chat' | 'Accounts' | 'Calendar' | 'Finance' | 'Devices';
  description: string;
  connected: boolean;
  /** The app's own brand colour, used only for its tile. */
  color: string;
  account?: string;
  lastSync?: string;
  settings?: { key: string; label: string; caption: string; on: boolean }[];
  mappings?: { from: string; to: string }[];
};

export type IntegrationActivity = {
  title: string;
  caption: string;
  tone: Tone;
  icon: 'video' | 'check' | 'refresh' | 'alert';
};

export type IntegrationsOverview = { apps: Integration[]; activity: IntegrationActivity[] };

const overview: IntegrationsOverview = {
  apps: [
    {
      id: 'teams',
      name: 'Microsoft Teams',
      category: 'Meetings',
      description: 'Schedule 1:1s, reviews and interviews; post announcements to channels.',
      connected: true,
      color: '#5059C9',
      account: 'acme.onmicrosoft.com',
      lastSync: '2 min ago',
    },
    {
      id: 'meet',
      name: 'Google Meet',
      category: 'Meetings',
      description: 'Add Meet links to trainings and reviews; sync with Google Calendar.',
      connected: true,
      color: '#00897B',
      account: 'acme.in',
      lastSync: '6 min ago',
    },
    {
      id: 'zoom',
      name: 'Zoom',
      category: 'Meetings',
      description: 'Create Zoom rooms for sessions and record attendance automatically.',
      connected: false,
      color: '#2D8CFF',
    },
    {
      id: 'jira',
      name: 'Jira',
      category: 'Work tracking',
      description: 'Pull assigned work into workload planning and link goals to epics.',
      connected: true,
      color: '#0052CC',
      account: 'acme.atlassian.net',
      lastSync: '4 min ago',
      settings: [
        {
          key: 'issues',
          label: 'Assigned issues to workload',
          caption: 'Story points become planned hours',
          on: true,
        },
        {
          key: 'epics',
          label: 'Epics to company goals',
          caption: 'Goal progress follows epic progress',
          on: true,
        },
        {
          key: 'leave',
          label: 'Leave to Jira capacity',
          caption: 'Planned leave blocks sprint capacity',
          on: true,
        },
        {
          key: 'contractors',
          label: 'Contractors',
          caption: 'Include non-employee assignees',
          on: false,
        },
      ],
      mappings: [
        { from: 'PAY · Payments', to: 'Engineering' },
        { from: 'WEB · Website', to: 'Design' },
        { from: 'OPS · Warehouse', to: 'Operations' },
      ],
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'Chat',
      description: 'Send leave approvals and kudos to Slack, approve with one click.',
      connected: false,
      color: '#4A154B',
    },
    {
      id: 'gws',
      name: 'Google Workspace',
      category: 'Accounts',
      description: 'Create and suspend accounts automatically on joining and exit.',
      connected: true,
      color: '#1A73E8',
      account: 'acme.in',
      lastSync: '1 h ago',
    },
    {
      id: 'outlook',
      name: 'Outlook calendar',
      category: 'Calendar',
      description: 'Show leave and holidays on everyone’s calendar.',
      connected: false,
      color: '#0F6CBD',
    },
    {
      id: 'tally',
      name: 'Tally Prime',
      category: 'Finance',
      description: 'Post payroll journals and reimbursements to your books.',
      connected: true,
      color: '#1F3A93',
      account: 'Acme Technologies Pvt Ltd',
      lastSync: 'Yesterday',
    },
    {
      id: 'bio',
      name: 'Biometric devices',
      category: 'Devices',
      description: 'eSSL, ZKTeco and Matrix devices sync check-ins every 5 minutes.',
      connected: false,
      color: '#3D4451',
    },
  ],
  activity: [
    {
      title: 'Teams meeting created',
      caption: 'H2 review · Ananya with Rahul · 10:05',
      tone: 'info',
      icon: 'video',
    },
    {
      title: 'Google account created',
      caption: 'arjun@acme.in · on joining',
      tone: 'success',
      icon: 'check',
    },
    {
      title: 'Jira sync finished',
      caption: '214 issues · 6 teams · 09:58',
      tone: 'primary',
      icon: 'refresh',
    },
    {
      title: 'Tally export needs review',
      caption: '2 ledgers not mapped',
      tone: 'warning',
      icon: 'alert',
    },
  ],
};

export const getIntegrations = () => demoDelay(structuredClone(overview));
