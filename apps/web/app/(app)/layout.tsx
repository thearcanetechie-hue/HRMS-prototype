'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { Icon, IconName } from '@/components/icon';
import { RequireSession, useSession } from '@/lib/session';

const NAV: { href: string; label: string; icon: IconName; permission?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/employees', label: 'Employees', icon: 'users', permission: 'employee.read' },
];

function Shell({ children }: { children: ReactNode }) {
  const { me, can, signOut } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initials = me.user.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">H</div>
          <div>
            <div>HRMS</div>
            <div className="muted" style={{ font: '600 11.5px var(--f-body)' }}>
              {me.tenant.name}
            </div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          <div className="nav-label">MANAGE</div>
          {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname.startsWith(n.href) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="avatar sm">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{me.user.fullName}</div>
                <div
                  className="muted"
                  style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {me.user.email}
                </div>
              </div>
            </div>
            <button className="btn btn-sm btn-block" style={{ marginTop: 12 }} onClick={signOut}>
              <Icon name="logout" size={15} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="top">
          <button
            className="btn icon-btn menu-btn"
            aria-label="Open menu"
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="menu" />
          </button>
          <div className="top-right">
            <span className="pill acc">{me.tenant.slug}</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <Shell>{children}</Shell>
    </RequireSession>
  );
}
