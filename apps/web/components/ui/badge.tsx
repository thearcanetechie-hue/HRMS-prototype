import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold bg-current/12 before:size-1.5 before:rounded-full before:bg-current',
  {
    variants: {
      tone: {
        neutral: 'text-muted-foreground',
        accent: 'text-primary-strong dark:text-primary',
        success: 'text-success',
        warning: 'text-warning',
        danger: 'text-danger',
        info: 'text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
