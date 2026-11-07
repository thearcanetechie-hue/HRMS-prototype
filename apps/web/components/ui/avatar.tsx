import { cn } from '@/lib/utils';

const SIZES = { sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg' } as const;

/** Initials in a raised circle with an accent ring. */
export function Avatar({
  initials,
  size = 'md',
  className,
}: {
  initials: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary-strong shadow-raised-sm dark:text-primary',
        SIZES[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
