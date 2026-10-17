'use client';

import { acceptInviteSchema } from '@hrms/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input } from '@/components/ui/input';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { FieldErrors, validate } from '@/lib/forms';

interface InviteInfo {
  companyName: string;
  workspace: string;
  email: string;
  fullName: string;
}

function AcceptInvite() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [linkError, setLinkError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLinkError('This invite link is incomplete. Open the full link HR sent you.');
      return;
    }
    api<InviteInfo>(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) =>
        setLinkError(err instanceof ApiError ? err.message : 'Could not reach the server.'),
      );
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    const { data, errors } = validate(acceptInviteSchema, {
      token,
      password: form.get('password'),
    });
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAccessToken(accessToken);
      router.replace('/profile');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  if (linkError) {
    return (
      <AuthLayout title="Invite link problem" subtitle={linkError}>
        <p className="text-muted-foreground">Ask your HR team to send a new invite.</p>
      </AuthLayout>
    );
  }
  if (!info) {
    return (
      <AuthLayout title="Checking your invite…" subtitle="One moment.">
        <div />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title={`Join ${info.companyName}`}
      subtitle={`Hi ${info.fullName.split(' ')[0]}, set a password to finish setting up your account.`}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Workspace <b className="font-mono">{info.workspace}</b>
          </div>
          <div className="font-bold">{info.email}</div>
        </div>
        <Field id="password" label="Password" error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <FormError>{formError}</FormError>
        <Button variant="primary" size="lg" className="w-full" type="submit" disabled={busy}>
          {busy ? 'Setting up…' : 'Set password and sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  );
}
