import { ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './logo';
import { ThemeToggle } from './theme';
import { IconTile } from './ui/page';

const POINTS = [
  [ShieldCheck, "Every company's data kept separate, visible only to people you allow"],
  [SlidersHorizontal, 'Roles, fields and approvals set up without code'],
  [Sparkles, 'AI assistant that only knows your company'],
] as const;

/** The split hero + raised card used by sign-in, sign-up and invite acceptance. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <div>
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3 text-lg font-extrabold">
            <Logo />
            HRMS Workspace
          </div>
          <ThemeToggle className="lg:hidden" />
        </div>
        <p className="mb-3 text-xs font-bold tracking-[0.14em] text-primary-strong uppercase dark:text-primary">
          Payroll · Attendance · People
        </p>
        <h1 className="max-w-xl text-[clamp(30px,4.4vw,48px)] leading-[1.08] font-extrabold">
          The HR workspace your team{' '}
          <span className="bg-gradient-to-r from-primary-soft to-primary-strong bg-clip-text text-transparent">
            opens every morning
          </span>
        </h1>
        <p className="mt-4 max-w-lg text-[15.5px] text-muted-foreground">
          Compliance-ready Indian payroll, attendance with biometrics, and a daily hub for every
          employee. Customise it in a few clicks.
        </p>
        <ul className="mt-8 hidden gap-4 sm:grid">
          {POINTS.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-4 font-semibold">
              <IconTile>
                <Icon />
              </IconTile>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative rounded-3xl bg-surface p-7 shadow-raised sm:p-9">
        <ThemeToggle className="absolute top-6 right-6 hidden lg:flex" />
        <h2 className="text-2xl">{title}</h2>
        <p className="mt-1.5 text-muted-foreground lg:pr-24">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}
