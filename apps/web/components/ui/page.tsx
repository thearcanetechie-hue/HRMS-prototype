import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Title block at the top of every screen, with optional actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  leading,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-xs font-bold tracking-[0.12em] text-detail uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Banner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'mb-5 flex items-center gap-3 rounded-xl bg-danger/10 px-4 py-3 font-semibold text-danger',
        className,
      )}
    >
      <AlertCircle className="size-5 shrink-0" />
      {children}
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('py-16 text-center text-muted-foreground', className)}>{children}</p>;
}

/** Small raised square holding an icon, used in lists and stat cards. */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-accent-2/14 text-accent-2 shadow-tile [&_svg]:size-[18px]',
        className,
      )}
    >
      {children}
    </span>
  );
}
