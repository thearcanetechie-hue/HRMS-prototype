'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogDescription = DialogPrimitive.Description;

/**
 * Modal panel. `side="right"` slides in a drawer (forms with many fields);
 * the default centres a dialog. Focus trapping, Escape and click-outside come from Radix.
 */
export function DialogContent({
  title,
  side = 'center',
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  side?: 'center' | 'right';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px] dark:bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 overflow-y-auto bg-surface p-6 shadow-raised outline-none',
          side === 'right'
            ? 'inset-y-0 right-0 w-full max-w-lg rounded-l-3xl'
            : 'top-1/2 left-1/2 max-h-[90vh] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl',
          className,
        )}
        {...props}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground shadow-raised-sm hover:text-foreground active:shadow-inset-sm"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
