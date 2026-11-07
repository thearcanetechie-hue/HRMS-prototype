import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';
import { IconTile } from './page';
import { TONE_TINT, type Tone } from './tone';

/** KPI card: icon tile and optional delta pill, a big number, and its label. */
export function StatCard({
  icon,
  tone,
  value,
  label,
  delta,
  deltaTone = 'success',
  className,
}: {
  icon: ReactNode;
  tone?: Tone;
  value: ReactNode;
  label: ReactNode;
  delta?: ReactNode;
  deltaTone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn('grid gap-3 p-5 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <IconTile tone={tone}>{icon}</IconTile>
        {delta != null && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
              TONE_TINT[deltaTone],
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div>
        <div className="text-[28px] leading-tight font-extrabold tabular">{value}</div>
        <div className="text-[14.5px] font-semibold text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
