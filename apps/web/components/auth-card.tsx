import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandPanel } from './auth-layout';
import { Logo } from './logo';
import { ThemeToggle } from './theme';

/** The shell for the small sign-in side pages: forgot password, reset, verify, find workspace. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      <main className="flex min-w-0 grow flex-col px-4 py-6 sm:px-16 sm:py-12">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/login"
            className="flex items-center gap-3 font-extrabold text-foreground no-underline lg:invisible"
          >
            <Logo /> HRMS
          </Link>
          <ThemeToggle />
        </div>
        <div className="grid grow place-items-center py-10">
          <div className="grid w-full max-w-[440px] gap-5 rounded-3xl bg-surface p-6 shadow-raised sm:p-9">
            <div>
              <h1 className="text-[26px]">{title}</h1>
              {description && <p className="mt-1 text-muted-foreground">{description}</p>}
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
