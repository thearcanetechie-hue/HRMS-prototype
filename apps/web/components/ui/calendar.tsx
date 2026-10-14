'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Month calendar (weeks start on Monday, as in India) with today highlighted.
 * Leave, holidays and meetings will mark days here once those modules exist.
 */
export function Calendar({ className }: { className?: string }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = (new Date(year, m, 1).getDay() + 6) % 7; // blanks before the 1st
  const days = new Date(year, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isToday = (d: number) =>
    d === today.getDate() && m === today.getMonth() && year === today.getFullYear();
  const shift = (n: number) => setMonth(new Date(year, m + n, 1));
  const nav =
    'grid size-8 cursor-pointer place-items-center rounded-full bg-surface text-primary-strong shadow-raised-sm active:shadow-inset-sm dark:text-primary';

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold tracking-wide uppercase">
          {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            className={nav}
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className={nav} aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[13px]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[11px] font-bold text-muted-foreground uppercase">
            {w}
          </div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`b${i}`} />
          ) : (
            <div
              key={d}
              aria-current={isToday(d) ? 'date' : undefined}
              className={cn(
                'grid h-8 place-items-center rounded-lg font-semibold tabular',
                isToday(d)
                  ? 'bg-gradient-to-b from-primary to-primary-strong text-primary-foreground shadow-glow'
                  : i % 7 >= 5
                    ? 'text-muted-foreground'
                    : 'text-foreground',
              )}
            >
              {d}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
