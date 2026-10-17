import * as LabelPrimitive from '@radix-ui/react-label';
import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const field =
  'h-11 w-full min-w-0 rounded-xl bg-surface-2 px-3.5 text-sm text-foreground shadow-inset-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus-visible:shadow-inset focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/60 disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:outline-2 aria-invalid:outline-danger/70';

/** A pressed-in text box. */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, className)} {...props} />;
}

/** Input with a small icon on the left, or a fixed prefix such as `+91`. */
export function IconInput({
  icon,
  className,
  ...props
}: ComponentProps<'input'> & { icon: ReactNode }) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <input className={cn(field, 'pl-10', className)} {...props} />
    </div>
  );
}

/** Checkbox tinted with the accent colour, with its label beside it. */
export function Checkbox({
  label,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label
      className={cn('inline-flex cursor-pointer items-center gap-2.5 text-[13.5px]', className)}
    >
      <input type="checkbox" className="size-4 shrink-0 cursor-pointer accent-primary" {...props} />
      <span>{label}</span>
    </label>
  );
}

/** Native select (keeps mobile pickers and keyboard behaviour) styled like Input. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(field, 'cursor-pointer appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-primary"
      />
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-[13px] font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Label + control + error message, wired together for screen readers. */
export function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12.5px] font-semibold text-danger" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  return (
    <p role="alert" className="min-h-5 text-[13px] font-semibold text-danger">
      {children}
    </p>
  );
}
