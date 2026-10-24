'use client';

import { passwordProblem, passwordStrength, type PasswordContext } from '@hrms/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Field, Input } from './ui/input';
import { cn } from '@/lib/utils';

const LABELS = [
  ['', ''],
  ['Too weak', 'text-danger'],
  ['Fair', 'text-warning'],
  ['Good', 'text-success'],
  ['Strong', 'text-success'],
] as const;

/**
 * A new-password field with a show/hide toggle, a strength meter, and the same checks the server
 * makes (length, common passwords, your own name or email), shown as you type.
 */
export function NewPasswordField({
  id = 'password',
  label = 'New password',
  value,
  onChange,
  context,
  error,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  context?: PasswordContext;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const problem = value ? passwordProblem(value, context) : null;
  const score = value ? (problem ? 1 : Math.max(2, passwordStrength(value))) : 0;
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className="pr-11"
          required
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground [&_svg]:size-4"
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-3" aria-live="polite">
        <div className="flex grow gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i <= score
                  ? score >= 3
                    ? 'bg-success'
                    : score === 2
                      ? 'bg-warning'
                      : 'bg-danger'
                  : 'bg-surface-2',
              )}
            />
          ))}
        </div>
        <span className={cn('text-xs font-bold', LABELS[score]?.[1])}>{LABELS[score]?.[0]}</span>
      </div>
      <p className={cn('text-xs', problem ? 'text-danger' : 'text-muted-foreground')}>
        {problem ??
          'At least 10 characters. A few unrelated words make a strong, memorable password.'}
      </p>
    </Field>
  );
}
