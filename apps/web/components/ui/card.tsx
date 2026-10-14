import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A raised panel. `inset` gives the pressed-in well used for read-only values and lists. */
export function Card({ className, inset, ...props }: ComponentProps<'div'> & { inset?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-surface p-5 sm:p-6',
        inset ? 'shadow-inset' : 'shadow-raised',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mb-4 flex flex-wrap items-center justify-between gap-3', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-base font-bold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />;
}
