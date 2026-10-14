import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A data table inside a raised card; scrolls sideways on small screens. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-raised">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<'thead'>) {
  return <thead {...props} />;
}

export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/60',
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'border-b border-border px-4 py-3.5 text-left text-xs font-bold tracking-wide whitespace-nowrap text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}

export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-muted-foreground">{children}</p>;
}
