'use client';

import {
  BookUser,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RequireSession, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  show: (can: (p: string) => boolean, hasEmployee: boolean) => boolean;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: () => true },
  { href: '/profile', label: 'My profile', icon: FileText, show: (_, hasEmployee) => hasEmployee },
  {
    href: '/team',
    label: 'My team',
    icon: Network,
    show: (can) => can('team.read') && !can('employee.read'),
  },
  { href: '/employees', label: 'Employees', icon: Users, show: (can) => can('employee.read') },
  {
    href: '/employees',
    label: 'Directory',
    icon: BookUser,
    show: (can) => !can('employee.read') && can('directory.read'),
  },
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
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col gap-6 bg-background p-5 transition-transform dark:bg-surface/70 dark:backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0 shadow-raised' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-1">
          <Logo />
          <div className="min-w-0">
            <div className="font-extrabold">HRMS</div>
            <div className="truncate text-xs font-semibold text-muted-foreground">
              {me.tenant.name}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto lg:hidden"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <nav aria-label="Main" className="grid gap-2">
          <div className="px-3 pb-1 text-[11px] font-bold tracking-[0.14em] text-muted-foreground">
            {can('employee.read') ? 'MANAGE' : 'MY WORK'}
          </div>
          {NAV.filter((n) => n.show(can, Boolean(me.employee))).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.label}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold no-underline transition-all',
                  active
                    ? 'bg-surface text-primary-strong shadow-raised-sm dark:text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:shadow-raised-sm',
                )}
              >
                <n.icon className="size-[18px]" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl p-4 shadow-raised">
          <div className="flex items-center gap-3">
            <Avatar initials={initials} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-bold">{me.user.fullName}</div>
              <div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
            </div>
          </div>
          <Button size="sm" className="mt-4 w-full" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 px-4 pt-4 pb-12 sm:px-8 lg:pt-6">
        <div className="mb-6 flex items-center gap-3">
          <Button
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <Badge tone="accent" className="hidden sm:inline-flex">
              {me.tenant.slug}
            </Badge>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto max-w-6xl">{children}</div>
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
