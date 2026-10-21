'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // Off: a grey track and grey knob, so it reads clearly on any card in both themes.
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full bg-muted-foreground/25 shadow-inset-sm transition-colors data-[state=checked]:bg-primary-soft/70 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-full bg-muted-foreground shadow-raised-sm transition-all data-[state=checked]:translate-x-6 data-[state=checked]:bg-surface" />
    </SwitchPrimitive.Root>
  );
}
