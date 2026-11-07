import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = { title: string; caption?: string };

function Dot({ index, state }: { index: number; state: 'done' | 'current' | 'upcoming' }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold',
        state === 'done' && 'bg-success/14 text-success',
        state === 'current' && 'bg-primary text-primary-foreground shadow-glow',
        state === 'upcoming' && 'bg-surface-2 text-muted-foreground',
      )}
    >
      {state === 'done' ? <Check className="size-4" /> : index + 1}
    </span>
  );
}

const stateOf = (i: number, current: number) =>
  i < current ? 'done' : i === current ? 'current' : 'upcoming';

/** Progress through numbered steps. `current` is zero-based. */
export function Stepper({
  steps,
  current,
  orientation = 'horizontal',
  className,
}: {
  steps: Step[];
  current: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  if (orientation === 'vertical') {
    return (
      <ol className={cn('grid gap-2', className)}>
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-2xl p-3',
              i === current && 'bg-surface shadow-raised-sm',
            )}
          >
            <Dot index={i} state={stateOf(i, current)} />
            <div className="min-w-0">
              <div className={cn('font-bold', i > current && 'text-muted-foreground')}>
                {s.title}
              </div>
              {s.caption && <div className="text-xs text-muted-foreground">{s.caption}</div>}
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn('flex items-center gap-2', className)}>
      {steps.map((s, i) => (
        <li
          key={s.title}
          aria-current={i === current ? 'step' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
        >
          <Dot index={i} state={stateOf(i, current)} />
          <span
            className={cn(
              'hidden text-[13px] font-semibold whitespace-nowrap sm:inline',
              i > current ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {s.title}
          </span>
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'h-0.5 min-w-4 flex-1 rounded-full',
                i < current ? 'bg-success' : 'bg-surface-2',
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
