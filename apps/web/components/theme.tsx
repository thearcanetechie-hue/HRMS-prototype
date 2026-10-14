'use client';

import { Moon, Sun } from 'lucide-react';
import { ThemeProvider as NextThemes, useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Light / dark theme, following the device setting until the person picks one. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

/** Two-position switch (sun / moon) styled like the toggles in the design reference. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={cn(
        'relative flex h-10 w-[76px] shrink-0 cursor-pointer items-center justify-between rounded-full bg-surface px-2.5 text-muted-foreground shadow-inset-sm',
        className,
      )}
    >
      <Sun className="size-4" />
      <Moon className="size-4" />
      <span
        className={cn(
          'absolute top-1 left-1 grid size-8 place-items-center rounded-full bg-gradient-to-b from-primary to-primary-strong text-primary-foreground shadow-glow transition-transform duration-200',
          dark && 'translate-x-9',
        )}
      >
        {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </span>
    </button>
  );
}
