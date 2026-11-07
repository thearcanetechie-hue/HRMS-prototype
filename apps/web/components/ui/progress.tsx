import { cn } from '@/lib/utils';
import { TONE_FILL, type Tone } from './tone';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Thin rounded bar. `value` is a percentage. */
export function ProgressBar({
  value,
  tone = 'primary',
  label,
  className,
}: {
  value: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamp(value))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className={cn('h-full rounded-full', TONE_FILL[tone])}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

/** Several segments in one track, for example done / in progress / not started. */
export function StackedBar({
  segments,
  label,
  className,
}: {
  segments: { value: number; tone: Tone; label: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ?? segments.map((s) => `${s.label} ${s.value}%`).join(', ')}
      className={cn('flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2', className)}
    >
      {segments.map((s) => (
        <div key={s.label} className={TONE_FILL[s.tone]} style={{ width: `${clamp(s.value)}%` }} />
      ))}
    </div>
  );
}

/** Skeleton block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} />;
}
