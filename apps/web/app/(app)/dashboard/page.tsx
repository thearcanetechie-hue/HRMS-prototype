'use client';

import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  HeartHandshake,
  MessagesSquare,
  Receipt,
  Sparkles,
  Target,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IconTile, PageHeader } from '@/components/ui/page';
import { ProgressRing } from '@/components/ui/progress-ring';
import { api, Named, Paged, Employee } from '@/lib/api';
import { useSession } from '@/lib/session';

const MODULES: { name: string; icon: LucideIcon; phase: number }[] = [
  { name: 'Onboarding & offboarding', icon: UserPlus, phase: 2 },
  { name: 'Attendance & biometrics', icon: Clock, phase: 2 },
  { name: 'Leave', icon: CalendarDays, phase: 2 },
  { name: 'Documents', icon: FileText, phase: 2 },
  { name: 'Payroll & compliance', icon: Wallet, phase: 3 },
  { name: 'Expenses & reimbursements', icon: Receipt, phase: 3 },
  { name: 'Performance & assessments', icon: Target, phase: 4 },
  { name: 'Learning & development', icon: GraduationCap, phase: 4 },
  { name: 'Engagement & feedback', icon: HeartHandshake, phase: 4 },
  { name: 'Communication & meetings', icon: MessagesSquare, phase: 4 },
  { name: 'Analytics & reporting', icon: BarChart3, phase: 5 },
  { name: 'AI assistant', icon: Sparkles, phase: 5 },
];

export default function DashboardPage() {
  const { me, can } = useSession();
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    onboarding: number;
    departments: number;
  } | null>(null);

  useEffect(() => {
    if (!can('employee.read')) return;
    const count = (q = '') =>
      api<Paged<Employee>>(`/employees?pageSize=1${q}`).then((r) => r.total);
    Promise.all([
      count(),
      count('&status=ACTIVE'),
      count('&status=ONBOARDING'),
      api<Named[]>('/org/departments'),
    ])
      .then(([total, active, onboarding, departments]) =>
        setStats({ total, active, onboarding, departments: departments.length }),
      )
      .catch(() => setStats(null));
  }, [can]);

  const kpis: [string, number | undefined, LucideIcon][] = [
    ['Employees', stats?.total, Users],
    ['Active', stats?.active, UserCheck],
    ['Onboarding', stats?.onboarding, UserPlus],
    ['Departments', stats?.departments, Building2],
  ];
  const activePct = stats && stats.total ? (stats.active / stats.total) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={me.tenant.name}
        title={`Good to see you, ${me.user.fullName.split(' ')[0]}`}
        description="Here's your workspace at a glance."
      />

      {!can('employee.read') && (
        <div className="mb-6 grid gap-5 sm:grid-cols-2">
          {[
            {
              href: '/profile',
              title: 'My profile',
              icon: FileText,
              text: 'Add your PAN, Aadhaar, bank account and emergency contact.',
            },
            {
              href: can('team.read') ? '/team' : '/employees',
              title: can('team.read') ? 'My team' : 'Directory',
              icon: Users,
              text: can('team.read') ? 'See everyone in your reporting line.' : 'Find a colleague.',
            },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="group text-inherit no-underline">
              <Card className="flex items-center gap-4 transition-transform group-hover:-translate-y-0.5">
                <IconTile>
                  <c.icon />
                </IconTile>
                <div className="grow">
                  <CardTitle>{c.title}</CardTitle>
                  <CardDescription>{c.text}</CardDescription>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {can('employee.read') && (
        <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 gap-5">
            {kpis.map(([label, value, Icon]) => (
              <Card key={label} className="flex items-center gap-4">
                <IconTile>
                  <Icon />
                </IconTile>
                <div>
                  <div className="text-[13px] font-semibold text-muted-foreground">{label}</div>
                  <div className="text-[28px] leading-tight font-extrabold tabular">
                    {value ?? '–'}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card className="flex items-center justify-center gap-6 lg:flex-col lg:gap-4">
            <ProgressRing value={activePct} label="Active" />
            <p className="max-w-40 text-center text-[13px] text-muted-foreground">
              Share of people who are active today
            </p>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <Badge tone="accent">Foundation live</Badge>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.name} className="flex items-center gap-3 rounded-xl p-3 shadow-inset-sm">
              <IconTile className="size-9 text-muted-foreground">
                <m.icon />
              </IconTile>
              <div className="grow text-[13.5px] font-semibold">{m.name}</div>
              <span className="text-[11px] font-bold whitespace-nowrap text-muted-foreground">
                Phase {m.phase}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
