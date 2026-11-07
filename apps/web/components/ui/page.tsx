import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_TINT, type Tone } from './tone';

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

/** Message strip above the content: errors by default, `tone="success"` for confirmations. */
export function Banner({
  children,
  className,
  tone = 'danger',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'danger' | 'success';
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'mb-5 flex items-center gap-3 rounded-xl px-4 py-3 font-semibold',
        tone === 'success' ? 'bg-success/12 text-success' : 'bg-danger/10 text-danger',
        className,
      )}
    >
      <Icon className="size-5 shrink-0" />
      {children}
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('py-16 text-center text-muted-foreground', className)}>{children}</p>;
}

const TILE_SIZE = { 32: 'size-8', 36: 'size-9', 40: 'size-10', 44: 'size-11' } as const;

/**
 * Small square holding an icon, used in lists and stat cards. Without a `tone` it is the
 * raised accent tile; with one it is a flat tint of that colour.
 */
export function IconTile({
  children,
  tone,
  size = 40,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  size?: keyof typeof TILE_SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl [&_svg]:size-[18px]',
        TILE_SIZE[size],
        tone ? TONE_TINT[tone] : 'bg-accent-2/14 text-accent-2 shadow-tile',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small neutral badge marking a screen that runs on sample data until its module is built. */
export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted-foreground/12 px-2.5 py-1 align-middle text-xs font-bold text-muted-foreground before:size-1.5 before:rounded-full before:bg-current">
      Demo data
    </span>
  );
}
