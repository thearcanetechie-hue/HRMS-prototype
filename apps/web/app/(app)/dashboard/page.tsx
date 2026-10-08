'use client';

import { useEffect, useState } from 'react';
import { Icon, IconName } from '@/components/icon';
import { api, Named, Paged, Employee } from '@/lib/api';
import { useSession } from '@/lib/session';

const MODULES: { name: string; icon: IconName; phase: number }[] = [
  { name: 'Onboarding & offboarding', icon: 'users', phase: 2 },
  { name: 'Attendance & biometrics', icon: 'clock', phase: 2 },
  { name: 'Leave', icon: 'cal', phase: 2 },
  { name: 'Payroll & compliance', icon: 'wallet', phase: 3 },
  { name: 'Expenses & reimbursements', icon: 'doc', phase: 3 },
  { name: 'Documents', icon: 'doc', phase: 2 },
  { name: 'Performance & assessments', icon: 'target', phase: 4 },
  { name: 'Learning & development', icon: 'up', phase: 4 },
  { name: 'Engagement & feedback', icon: 'heart', phase: 4 },
  { name: 'Internal communication & meetings', icon: 'video', phase: 4 },
  { name: 'Analytics & reporting', icon: 'hub', phase: 5 },
  { name: 'AI assistant', icon: 'spark', phase: 5 },
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

  const kpis: [string, number | undefined, IconName][] = [
    ['Employees', stats?.total, 'users'],
    ['Active', stats?.active, 'check'],
    ['Onboarding', stats?.onboarding, 'plus'],
    ['Departments', stats?.departments, 'hub'],
  ];

  return (
    <>
      <div className="page-h">
        <div>
          <p className="eyebrow">{me.tenant.name}</p>
          <h1>Good to see you, {me.user.fullName.split(' ')[0]}</h1>
          <p>Here&apos;s your workspace at a glance.</p>
        </div>
      </div>
      {!can('employee.read') && (
        <div className="grid g2" style={{ marginBottom: 18 }}>
          <a
            href="/profile"
            className="card lift"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <div className="card-h">
              <h3>My profile</h3>
              <Icon name="doc" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Add your PAN, Aadhaar, bank account and emergency contact.
            </p>
          </a>
          <a
            href={can('team.read') ? '/team' : '/employees'}
            className="card lift"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <div className="card-h">
              <h3>{can('team.read') ? 'My team' : 'Directory'}</h3>
              <Icon name="users" />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {can('team.read') ? 'See everyone in your reporting line.' : 'Find a colleague.'}
            </p>
          </a>
        </div>
      )}
      {can('employee.read') && (
        <div className="grid g4" style={{ marginBottom: 18 }}>
          {kpis.map(([label, value, icon], i) => (
            <div key={label} className={`card kpi lift ${i === 0 ? 'hot' : ''}`}>
              <div className="label">
                <span className="kpi-ico">
                  <Icon name={icon} size={16} />
                </span>
                {label}
              </div>
              <div className="value num">{value ?? '–'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-h">
          <h3>Modules</h3>
          <span className="pill acc">Foundation live</span>
        </div>
        <div className="list">
          {MODULES.map((m) => (
            <div key={m.name} className="row module-soon">
              <span className="kpi-ico">
                <Icon name={m.icon} size={16} />
              </span>
              <div className="grow">
                <div className="t">{m.name}</div>
              </div>
              <span className="pill">Phase {m.phase}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
