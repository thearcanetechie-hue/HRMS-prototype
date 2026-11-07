'use client';

import { Check, Search, Upload, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { IconTile } from './page';
import { Switch } from './switch';
import type { Tone } from './tone';

/** The pressed-in search well from the top bar, reusable inside pages. */
export function SearchField({
  className,
  hint,
  ...props
}: ComponentProps<'input'> & { hint?: ReactNode }) {
  return (
    <label
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-xl bg-surface-2 px-3.5 shadow-inset-sm focus-within:outline-2 focus-within:outline-ring/60',
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        className="h-full min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
        {...props}
      />
      {hint && (
        <kbd className="hidden rounded-md bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground shadow-raised-sm sm:inline">
          {hint}
        </kbd>
      )}
    </label>
  );
}

/** A switch with a title and caption, for settings lists. */
export function ToggleRow({
  title,
  caption,
  checked,
  defaultChecked,
  onCheckedChange,
  className,
}: {
  title: ReactNode;
  caption?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="font-semibold">{title}</div>
        {caption && <div className="text-[13px] text-muted-foreground">{caption}</div>}
      </label>
      <Switch
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** Drop zone with no border: a pressed-in well that also opens the file picker. */
export function FileDrop({
  title,
  caption,
  accept,
  onFile,
  className,
}: {
  title: ReactNode;
  caption?: ReactNode;
  accept?: string;
  onFile: (file: File) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={cn(
        'grid cursor-pointer place-items-center gap-2 rounded-[18px] bg-surface-2 px-6 py-10 text-center shadow-inset',
        className,
      )}
    >
      <IconTile size={44}>
        <Upload />
      </IconTile>
      <div className="font-bold">{title}</div>
      {caption && <div className="text-[13px] text-muted-foreground">{caption}</div>}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

/** Icon tile + bold line + muted caption; used in logs and activity lists. */
export function ActivityItem({
  icon,
  tone,
  title,
  caption,
  trailing,
  className,
}: {
  icon: ReactNode;
  tone?: Tone;
  title: ReactNode;
  caption?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <IconTile tone={tone ?? 'primary'} size={36}>
        {icon}
      </IconTile>
      <div className="min-w-0 grow">
        <div className="truncate font-semibold">{title}</div>
        {caption && <div className="truncate text-xs text-muted-foreground">{caption}</div>}
      </div>
      {trailing}
    </div>
  );
}

/** Approve and decline square buttons. */
export function ApproveButtons({
  subject,
  onApprove,
  onDecline,
}: {
  subject: string;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const base =
    'grid size-8 shrink-0 cursor-pointer place-items-center rounded-[10px] transition-all hover:brightness-110 active:shadow-inset-sm [&_svg]:size-4';
  return (
    <div className="flex gap-2">
      <button
        type="button"
        aria-label={`Approve ${subject}`}
        className={cn(base, 'bg-success/12 text-success')}
        onClick={onApprove}
      >
        <Check />
      </button>
      <button
        type="button"
        aria-label={`Decline ${subject}`}
        className={cn(base, 'bg-danger/10 text-danger')}
        onClick={onDecline}
      >
        <X />
      </button>
    </div>
  );
}

/** Coloured dot with a label and value, for chart legends. */
export function LegendDot({
  className,
  label,
  value,
}: {
  className: string;
  label: ReactNode;
  value?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
      <span aria-hidden="true" className={cn('size-2.5 rounded-full', className)} />
      {label}
      {value != null && <b className="text-foreground tabular">{value}</b>}
    </span>
  );
}

/** A short message in the corner, cleared after a few seconds. */
export function useToast(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    clearTimeout(timer.current);
    setMessage(m);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }, []);
  return [message, show];
}

export function Toast({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="fixed right-6 bottom-6 z-50">
      {message && (
        <div className="rounded-xl bg-surface px-4 py-3 font-semibold shadow-raised">{message}</div>
      )}
    </div>
  );
}
