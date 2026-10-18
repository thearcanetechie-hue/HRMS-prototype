'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Never wider than its container: on phones the tab list scrolls sideways instead. */
export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('min-w-0 max-w-full', className)} {...props} />;
}
export const TabsContent = TabsPrimitive.Content;

/** Segmented control: a pressed-in track with the active tab raised. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-[14px] bg-surface-2 p-1 shadow-inset-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'h-8 cursor-pointer rounded-[10px] px-3.5 text-[13px] font-semibold whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-surface data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-raised-sm',
        className,
      )}
      {...props}
    />
  );
}
