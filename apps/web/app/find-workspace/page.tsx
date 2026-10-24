'use client';

import { emailOnlySchema } from '@hrms/shared';
import { Loader2, Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { Field, FormError, IconInput } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { FieldErrors, validate } from '@/lib/forms';

export default function FindWorkspacePage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const { data, errors } = validate(
      emailOnlySchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      await api('/auth/find-workspaces', { method: 'POST', body: JSON.stringify(data) });
      setSent(data.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Find your workspace"
      description="We’ll email you the workspaces you can sign in to."
    >
      {sent ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2/60 p-4 text-[13.5px]">
          <MailCheck className="size-6 shrink-0 text-success" />
          If {sent} has a login anywhere, the list is on its way.
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
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
          <FormError>{error}</FormError>
          <Button variant="primary" size="lg" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Email me my workspaces
          </Button>
        </form>
      )}
      <Link href="/login" className="text-[13.5px]">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
