'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  BarChart3,
  Bell,
  BookUser,
  Clock,
  FileText,
  Folder,
  GraduationCap,
  Heart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Network,
  Plug,
  Receipt,
  Settings,
  Target,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';
import { Avatar } from '@/components/ui/avatar';
import { SearchField } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { RequireSession, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type Can = (p: string) => boolean;
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  show: (can: Can, hasEmployee: boolean) => boolean;
};

const always = () => true;
const isHr: NavItem['show'] = (can) => can('employee.read');

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Home', icon: LayoutDashboard, show: always },
      { href: '/attendance', label: 'Attendance & leave', icon: Clock, show: always },
      { href: '/employees', label: 'Employees', icon: Users, show: isHr },
      {
        href: '/employees',
        label: 'Directory',
        icon: BookUser,
        show: (can) => !can('employee.read') && can('directory.read'),
      },
      {
        href: '/team',
        label: 'My team',
        icon: Network,
        show: (can) => can('team.read') && !can('employee.read'),
      },
      { href: '/profile', label: 'My profile', icon: FileText, show: (_, e) => e },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/payroll', label: 'Payroll & compliance', icon: Wallet, show: isHr },
      { href: '/claims', label: 'Overtime & claims', icon: Receipt, show: always },
    ],
  },
  {
    group: 'Growth',
    items: [
      { href: '/performance', label: 'Performance', icon: Target, show: always },
      { href: '/learning', label: 'Learning', icon: GraduationCap, show: always },
      { href: '/documents', label: 'Documents', icon: Folder, show: always },
    ],
  },
  {
    group: 'People & comms',
    items: [
      { href: '/engagement', label: 'Engagement', icon: Heart, show: always },
      { href: '/inbox', label: 'Inbox', icon: Inbox, count: 4, show: always },
    ],
  },
  {
    group: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, show: isHr },
      { href: '/integrations', label: 'Integrations', icon: Plug, show: isHr },
    ],
  },
];

const toInitials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function UserCard() {
  const { me, can, signOut } = useSession();
  return (
    <div className="mt-auto flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-raised-sm">
      <Avatar initials={toInitials(me.user.fullName)} size="sm" />
      <div className="min-w-0 grow">
        <div className="truncate font-bold">{me.user.fullName}</div>
        <div className="truncate text-xs text-muted-foreground">
          {can('employee.read') ? 'HR · Admin' : can('team.read') ? 'Manager' : 'Employee'}
        </div>
      </div>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Account and settings">
            <Settings />
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            side="top"
            align="end"
            sideOffset={8}
            className="z-50 grid w-60 gap-1 rounded-2xl bg-surface p-2 shadow-raised"
          >
            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <span className="text-[13px] font-semibold text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <Menu.Item
              onSelect={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 font-semibold text-danger outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4"
            >
              <LogOut /> Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {open && (
        <div className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col gap-5 overflow-y-auto bg-background px-[18px] py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
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
        <nav aria-label="Main" className="grid gap-4">
          {NAV.map(({ group, items }) => {
            const visible = items.filter((n) => n.show(can, Boolean(me.employee)));
            if (!visible.length) return null;
            return (
              <div key={group} className="grid gap-1">
                <div className="px-3 pb-1 text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">
                  {group}
                </div>
                {visible.map((n) => {
                  const active = pathname === n.href || pathname.startsWith(n.href + '/');
                  return (
                    <Link
                      key={n.label}
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold no-underline transition-all',
                        active
                          ? 'bg-surface text-primary shadow-raised-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <n.icon className="size-[18px]" />
                      <span className="grow">{n.label}</span>
                      {n.count != null && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground tabular">
                          {n.count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <UserCard />
      </aside>
      <main className="min-w-0 px-4 pt-4 pb-14 sm:pt-7 sm:pr-10 sm:pl-4 lg:pl-4">
        <div className="mx-auto grid max-w-[1120px] gap-6">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <MenuIcon />
            </Button>
            <SearchField
              className="max-w-[420px]"
              placeholder="Search people, documents, requests"
              aria-label="Search"
              hint="Ctrl K"
            />
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/inbox"
                aria-label="Notifications"
                className="relative grid size-11 place-items-center rounded-xl bg-surface text-foreground shadow-raised-sm"
              >
                <Bell className="size-[18px]" />
                <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary" />
              </Link>
              <Avatar initials={toInitials(me.user.fullName)} className="hidden sm:grid" />
            </div>
          </div>
          <div>{children}</div>
        </div>
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
