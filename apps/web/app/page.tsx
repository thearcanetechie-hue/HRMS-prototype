'use client';

import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Check,
  Clock,
  Eye,
  Folder,
  GraduationCap,
  Heart,
  Inbox,
  Play,
  Plug,
  Receipt,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/page';
import { ProgressBar } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { refreshSession } from '@/lib/api';
import {
  FOOTER,
  HERO,
  LOGOS,
  MODULES,
  NAV_LINKS,
  PAYROLL,
  PLANS,
  PREVIEW,
  STATS,
} from '@/lib/marketing';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  clock: Clock,
  wallet: Wallet,
  'user-plus': UserPlus,
  target: Target,
  'graduation-cap': GraduationCap,
  folder: Folder,
  heart: Heart,
  inbox: Inbox,
  receipt: Receipt,
  briefcase: Briefcase,
  plug: Plug,
};

const pad = 'px-6 lg:px-24';
const eyebrow = 'text-xs font-bold tracking-[0.12em] text-detail uppercase';

/**
 * Public landing page (screen 01), the first thing anyone sees. People go on to sign in only
 * when they choose to; someone already signed in gets a link back to their workspace instead.
 */
export default function LandingPage() {
  const [billing, setBilling] = useState('yearly');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    refreshSession().then(setSignedIn);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero: dark in both themes. */}
      <header className={cn('dark bg-background pt-7 pb-24 text-foreground', pad)}>
        <nav className="flex items-center gap-8" aria-label="Main">
          <div className="flex items-center gap-3 text-lg font-extrabold">
            <Logo /> HRMS
          </div>
          <ul className="hidden gap-8 font-semibold text-muted-foreground lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l}>
                <a
                  href={`#${l.toLowerCase()}`}
                  className="text-muted-foreground no-underline hover:text-foreground"
                >
                  {l}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-4">
            <Link
              href={signedIn ? '/dashboard' : '/login'}
              className="font-semibold text-foreground no-underline"
            >
              {signedIn ? 'Open your workspace' : 'Sign in'}
            </Link>
            <Button variant="primary" asChild className="hidden sm:inline-flex">
              <Link href="/signup">Start free trial</Link>
            </Button>
          </div>
        </nav>

        <div
          id="product"
          className="mt-16 grid items-center gap-16 lg:mt-[88px] xl:grid-cols-[1fr_560px]"
        >
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/14 px-3.5 py-1.5 text-[13px] font-semibold text-primary">
              <Sparkles className="size-4" /> {HERO.pill}
            </span>
            <h1 className="mt-6 text-[clamp(40px,5.2vw,60px)] leading-[1.06] font-extrabold tracking-[-0.02em]">
              {HERO.title}
            </h1>
            <p className="mt-5 max-w-[540px] text-lg text-muted-foreground">{HERO.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" className="h-[52px]" asChild>
                <Link href="/signup">
                  Start free trial <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" className="h-[52px]">
                <Video /> Book a demo
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted-foreground">
              {HERO.trust.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview: light theme inside the dark hero. */}
          <div className="light text-foreground" aria-label="Product preview" role="img">
            <div className="grid gap-4 rounded-3xl bg-background p-6 shadow-raised">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold">{PREVIEW.greeting}</span>
                <Badge tone="success">Payroll ready</Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {PREVIEW.stats.map(([n, l]) => (
                  <div key={l} className="rounded-2xl bg-surface-2 p-3 shadow-inset-sm">
                    <div className="text-xl font-extrabold tabular">{n}</div>
                    <div className="text-xs text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-surface p-4 shadow-raised-sm">
                <div className="mb-3 text-[13px] font-bold">
                  Attendance this week · <span className="text-muted-foreground">Avg 93%</span>
                </div>
                <BarChart
                  label="Attendance this week"
                  height={110}
                  max={100}
                  highlight="Fri"
                  showValues={false}
                  data={PREVIEW.week.map(([label, value]) => ({ label, value }))}
                />
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-raised-sm">
                <Avatar size="sm" initials={PREVIEW.leave.initials} />
                <div className="min-w-0 grow">
                  <div className="text-[13.5px] font-bold">{PREVIEW.leave.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{PREVIEW.leave.what}</div>
                </div>
                <span className="rounded-lg bg-gradient-to-b from-primary to-primary-strong px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-glow">
                  Approve
                </span>
              </div>
            </div>
          </div>
        </div>

        <div id="customers" className="mt-[72px]">
          <p className={eyebrow}>Trusted by teams at</p>
          <ul className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-lg font-bold text-muted-foreground">
            {LOGOS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </header>

      <main>
        <section id="modules" className={cn('py-24', pad)}>
          <div className="mx-auto max-w-2xl text-center">
            <p className={eyebrow}>Everything HR, one login</p>
            <h2 className="mt-3 text-[clamp(30px,3.4vw,40px)] leading-tight">
              Fourteen modules that work as one
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start with the basics and switch on more as you grow. Every module shares the same
              people data.
            </p>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(([icon, title, line]) => {
              const Icon = ICONS[icon] ?? BarChart3;
              return (
                <li key={title}>
                  <Card className="grid h-full content-start gap-3 p-5 sm:p-5">
                    <IconTile>
                      <Icon />
                    </IconTile>
                    <div>
                      <div className="font-bold">{title}</div>
                      <div className="text-[13.5px] text-muted-foreground">{line}</div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={cn('grid items-center gap-12 pb-24 lg:grid-cols-2', pad)}>
          <div>
            <p className={eyebrow}>{PAYROLL.eyebrow}</p>
            <h2 className="mt-3 text-[clamp(28px,3.2vw,38px)] leading-tight">{PAYROLL.title}</h2>
            <p className="mt-4 max-w-xl text-muted-foreground">{PAYROLL.body}</p>
            <ul className="mt-6 grid gap-3">
              {PAYROLL.checks.map((c) => (
                <li key={c} className="flex items-center gap-3 font-semibold">
                  <span className="grid size-6 place-items-center rounded-full bg-success/14 text-success">
                    <Check className="size-3.5" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <Card className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold">{PAYROLL.card.title}</div>
                <div className="text-[13px] text-muted-foreground">{PAYROLL.card.caption}</div>
              </div>
              <Badge tone="accent">Ready to run</Badge>
            </div>
            <ul className="grid gap-3.5">
              {PAYROLL.card.rows.map(([label, amount, pct]) => (
                <li key={label} className="grid gap-1.5">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">{label}</span>
                    <span className="font-mono text-[13px]">{amount}</span>
                  </div>
                  <ProgressBar value={pct} label={label} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button>
                <Eye /> Preview payslips
              </Button>
              <Button variant="primary" asChild>
                <Link href="/signup">
                  <Play /> Run payroll
                </Link>
              </Button>
            </div>
          </Card>
        </section>

        <section className={cn('dark bg-background py-16 text-foreground', pad)}>
          <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map(([n, l]) => (
              <li key={l}>
                <div className="text-[44px] leading-none font-extrabold text-primary tabular">
                  {n}
                </div>
                <div className="mt-2 font-semibold text-muted-foreground">{l}</div>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className={cn('py-24', pad)}>
          <div className="mx-auto grid max-w-2xl justify-items-center gap-4 text-center">
            <p className={eyebrow}>Pricing</p>
            <h2 className="text-[clamp(30px,3.4vw,40px)] leading-tight">
              Simple pricing per employee
            </h2>
            <Tabs value={billing} onValueChange={setBilling}>
              <TabsList>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">Yearly · save 20%</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <ul className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
            {PLANS.map((p) => {
              const price = billing === 'yearly' ? p.yearly : p.monthly;
              return (
                <li
                  key={p.name}
                  className={cn(
                    'relative grid content-start gap-5 rounded-3xl p-7',
                    p.highlight
                      ? 'bg-foreground text-background shadow-raised'
                      : 'bg-surface shadow-raised',
                  )}
                >
                  {p.highlight && (
                    <span className="absolute top-6 right-6 rounded-full bg-gradient-to-b from-[#dcb06a] to-[#c28d39] px-3 py-1 text-xs font-bold text-[#1a1206]">
                      Most popular
                    </span>
                  )}
                  <div>
                    <div className="text-lg font-bold">{p.name}</div>
                    <div
                      className={cn(
                        'text-[13.5px]',
                        p.highlight ? 'opacity-70' : 'text-muted-foreground',
                      )}
                    >
                      {p.tagline}
                    </div>
                  </div>
                  <div>
                    {price === null ? (
                      <span className="text-4xl font-extrabold">Custom</span>
                    ) : (
                      <>
                        <span className="text-4xl font-extrabold tabular">₹ {price}</span>
                        <span
                          className={cn(
                            'text-[13px]',
                            p.highlight ? 'opacity-70' : 'text-muted-foreground',
                          )}
                        >
                          {' '}
                          / employee / month
                        </span>
                      </>
                    )}
                  </div>
                  <ul className="grid gap-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[14px] font-semibold">
                        <Check
                          className={cn('size-4', p.highlight ? 'text-[#c28d39]' : 'text-success')}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={p.highlight ? 'primary' : 'default'}
                    className="w-full"
                    asChild={p.cta !== 'Talk to sales'}
                  >
                    {p.cta === 'Talk to sales' ? p.cta : <Link href="/signup">{p.cta}</Link>}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <footer id="resources" className={cn('dark bg-background pt-16 pb-10 text-foreground', pad)}>
        <div className="grid items-center gap-6 rounded-3xl bg-surface p-8 shadow-raised lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-[clamp(26px,2.8vw,34px)] leading-tight">
              Bring your whole team in this week
            </h2>
            <p className="mt-2 text-muted-foreground">
              Import from Excel or connect your database. We help you move, free.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg">
              <Video /> Book a demo
            </Button>
            <Button variant="primary" size="lg" asChild>
              <Link href="/signup">Start free trial</Link>
            </Button>
          </div>
        </div>
        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3 text-lg font-extrabold">
              <Logo /> HRMS
            </div>
            <p className="mt-3 max-w-xs text-muted-foreground">{FOOTER.blurb}</p>
          </div>
          {FOOTER.columns.map(([title, links]) => (
            <div key={title}>
              <div className="mb-3 font-bold">{title}</div>
              <ul className="grid gap-2 text-muted-foreground">
                {links.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap justify-between gap-3 text-[13px] text-muted-foreground">
          <span>{FOOTER.legal}</span>
          <span>{FOOTER.links}</span>
        </div>
      </footer>
    </div>
  );
}
