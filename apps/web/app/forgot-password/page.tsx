'use client';

import { forgotPasswordSchema } from '@hrms/shared';
import { Building2, Loader2, Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Field, FormError, IconInput } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { FieldErrors, validate } from '@/lib/forms';

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <Forgot />
    </Suspense>
  );
}

function Forgot() {
  const params = useSearchParams();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const { data, errors } = validate(
      forgotPasswordSchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) });
      setSent(data.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <AuthCard
        title="Check your email"
        description={<>If {sent} has a login in that workspace, a reset link is on its way.</>}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2/60 p-4 text-[13.5px]">
          <MailCheck className="size-6 shrink-0 text-success" />
          The link works once, for 30 minutes. Not there? Check spam, or make sure the workspace is
          right.
        </div>
        <Link href="/login" className="text-[13.5px] font-semibold">
          Back to sign in
        </Link>
      </AuthCard>
    );

  return (
    <AuthCard title="Reset your password" description="We’ll email you a link to choose a new one.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <fieldset disabled={busy} className="grid gap-4">
          <Field id="workspace" label="Workspace" error={errors.workspace}>
            <IconInput
              icon={<Building2 />}
              id="workspace"
              name="workspace"
              defaultValue={params.get('workspace') ?? ''}
              placeholder="acme"
              required
            />
          </Field>
          <Field id="email" label="Work email" error={errors.email}>
            <IconInput
              icon={<Mail />}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.in"
              required
            />
          </Field>
        </fieldset>
        <FormError>{error}</FormError>
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Send reset link
        </Button>
        <div className="flex justify-between text-[13.5px]">
          <Link href="/login">Back to sign in</Link>
          <Link href="/find-workspace">Forgot your workspace?</Link>
        </div>
      </form>
    </AuthCard>
  );
}
