import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold no-underline transition-all duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Teal pill with a soft glow: the one main action on a screen.
        primary:
          'bg-gradient-to-b from-primary to-primary-strong text-primary-foreground shadow-glow hover:brightness-105 active:translate-y-px active:shadow-inset-sm',
        // Raised grey button that presses in when clicked.
        default:
          'bg-surface text-foreground shadow-raised-sm hover:text-primary-strong dark:hover:text-primary active:shadow-inset-sm',
        ghost:
          'text-muted-foreground hover:bg-surface-2 hover:text-foreground active:shadow-inset-sm',
        danger:
          'bg-surface text-danger shadow-raised-sm hover:brightness-105 active:shadow-inset-sm',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
