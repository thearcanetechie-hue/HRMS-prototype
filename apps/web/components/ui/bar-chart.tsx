import { cn } from '@/lib/utils';

/**
 * Vertical bars drawn with divs. Bars are a faint accent tint; the `highlight` bar is solid.
 * `max` defaults to the largest value. `format` renders the value shown above each bar.
 */
export function BarChart({
  data,
  highlight,
  max,
  height = 180,
  format = (v) => String(v),
  showValues = true,
  label,
  className,
}: {
  data: { label: string; value: number; key?: string }[];
  highlight?: string;
  max?: number;
  height?: number;
  format?: (v: number) => string;
  showValues?: boolean;
  label: string;
  className?: string;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className={cn('w-full', className)}>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}
      </figcaption>
      <div aria-hidden="true" className="flex items-end gap-2 sm:gap-3" style={{ height }}>
        {data.map((d) => {
          const on = (d.key ?? d.label) === highlight;
          return (
            <div
              key={d.key ?? d.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
            >
              {showValues && (
                <span
                  className={cn(
                    'text-center text-[11px] font-bold tabular',
                    on ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {format(d.value)}
                </span>
              )}
              <div
                className={cn(
                  'w-full rounded-lg',
                  on
                    ? 'bg-gradient-to-b from-primary-soft to-primary shadow-glow'
                    : 'bg-primary/28',
                )}
                style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value ? 4 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2 sm:gap-3">
        {data.map((d) => (
          <span
            key={d.key ?? d.label}
            className={cn(
              'min-w-0 flex-1 truncate text-center text-[11.5px] font-semibold',
              (d.key ?? d.label) === highlight ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
