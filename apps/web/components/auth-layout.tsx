import { ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './logo';
import { ThemeToggle } from './theme';
import { Avatar } from './ui/avatar';
import { IconTile } from './ui/page';

const STATS = [
  ['98.6%', 'Payroll on time'],
  ['3 min', 'To approve leave'],
  ['1,240', 'Companies'],
] as const;

/** Always-dark brand panel on the left of the sign-in screen. */
export function BrandPanel() {
  return (
    <aside className="dark hidden min-h-screen w-[min(620px,45vw)] shrink-0 flex-col bg-background px-14 py-12 text-foreground lg:flex">
      <div className="flex items-center gap-3 text-lg font-extrabold">
        <Logo /> HRMS
      </div>
      <div className="mt-auto grid gap-8 pt-10">
        <div>
          <p className="mb-3 text-xs font-bold tracking-[0.12em] text-primary uppercase">
            Your people, in one place
          </p>
          <h1 className="text-[clamp(30px,2.8vw,40px)] leading-[1.12] font-extrabold">
            Run HR the calm way. Attendance, payroll and growth in one workspace.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Built for Indian teams: PF, ESI, PT and TDS handled, payslips on time, and every
            document a search away.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {STATS.map(([n, l]) => (
            <div key={l} className="rounded-2xl bg-surface p-4 shadow-raised-sm">
              <div className="text-2xl font-extrabold text-primary tabular">{n}</div>
              <div className="text-[13px] font-semibold text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
        <figure className="rounded-2xl bg-surface p-6 shadow-raised-sm">
          <blockquote className="text-[15px] leading-relaxed">
            “We closed October payroll for 340 people in an afternoon. The compliance reports were
            simply there.”
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <Avatar initials="RN" size="sm" />
            <div>
              <div className="font-bold">Rohan Nair</div>
              <div className="text-xs text-muted-foreground">Head of People, Kestrel Labs</div>
            </div>
          </figcaption>
        </figure>
      </div>
    </aside>
  );
}

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
