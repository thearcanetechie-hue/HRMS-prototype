import { useId } from 'react';

/** Circular gauge (as in the design reference) for percentages such as attendance or completion. */
export function ProgressRing({
  value,
  label,
  size = 132,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const id = 'ring' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 11;
  const r = (size - stroke) / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={`${label}: ${pct}%`}
      className="relative grid shrink-0 place-items-center rounded-full bg-surface shadow-raised"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-3 rounded-full shadow-inset" />
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary-soft)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <div className="relative text-center">
        <div className="text-2xl font-extrabold tabular">{pct}%</div>
        <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
