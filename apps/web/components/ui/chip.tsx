import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Filter pill. Raised when off, filled with the accent and a glow when on. */
export function Chip({
  active = false,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-all [&_svg]:size-4',
        active
          ? 'bg-primary text-primary-foreground shadow-glow'
          : 'bg-surface text-muted-foreground shadow-raised-sm hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
