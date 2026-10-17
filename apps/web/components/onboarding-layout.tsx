'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo';
import { ThemeToggle } from './theme';
import { ProgressBar } from './ui/progress';
import { Stepper } from './ui/stepper';

const STEPS = [
  { title: 'About you', caption: 'Your name and login' },
  { title: 'Your company', caption: 'Name, size and location' },
  { title: 'Bring your team', caption: 'Import or connect your data' },
];

/** Shared frame for the three sign-up steps: top bar, stepper on the left, form card. */
export function OnboardingLayout({
  step,
  title,
  description,
  onSaveAndExit,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  description: ReactNode;
  onSaveAndExit?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 px-4 py-5 sm:px-12 sm:py-6">
        <div className="flex items-center gap-3 font-extrabold">
          <Logo /> HRMS
        </div>
        <div className="ml-auto flex items-center gap-4 text-[13.5px]">
          <span className="font-semibold text-muted-foreground">Step {step} of 3</span>
          <ProgressBar
            value={[33, 67, 100][step - 1]}
            className="hidden w-40 sm:block"
            label="Sign-up progress"
          />
          {onSaveAndExit ? (
            <button
              type="button"
              onClick={onSaveAndExit}
              className="cursor-pointer font-bold text-primary"
            >
              Save and exit
            </button>
          ) : (
            <Link href="/" className="font-bold">
              Save and exit
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 pb-16 sm:px-12 lg:grid-cols-[300px_1fr]">
        <aside className="grid content-start gap-6">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.1em] text-detail uppercase">
              Set up your workspace
            </p>
            <h2 className="text-[22px] leading-snug">
              A few details and your HR workspace is ready.
            </h2>
          </div>
          <Stepper steps={STEPS} current={step - 1} orientation="vertical" />
          <div className="hidden gap-2 rounded-2xl bg-surface-2 p-4 shadow-inset-sm lg:grid">
            <div className="flex items-center gap-2 font-bold">
              <MessageCircle className="size-4 text-primary" /> Need a hand?
            </div>
            <p className="text-[13px] text-muted-foreground">
              Our onboarding team moves your data for free. Book a 20-minute call.
            </p>
          </div>
        </aside>
        <section className="grid content-start gap-6 rounded-3xl bg-surface p-6 shadow-raised sm:p-10">
          <div>
            <h1 className="text-[28px]">{title}</h1>
            <p className="mt-1 text-muted-foreground">{description}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
