'use client';

import { loginSchema } from '@hrms/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthLayout, Field } from '@/components/auth-layout';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { FieldErrors, validate } from '@/lib/forms';

export default function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const { data, errors } = validate(
      loginSchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAccessToken(accessToken);
      router.replace('/dashboard');
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : err instanceof ApiError
            ? err.message
            : 'Could not reach the server.',
      );
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your company workspace.">
      <form onSubmit={onSubmit} noValidate>
        <Field id="workspace" label="Workspace" error={errors.workspace}>
          <input
            className="input"
            id="workspace"
            name="workspace"
            autoComplete="organization"
            placeholder="your-company"
            required
          />
        </Field>
        <Field id="email" label="Work email" error={errors.email}>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="err" role="alert">
          {formError}
        </div>
        <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ textAlign: 'center', margin: '16px 0 0' }} className="muted">
        New here? <Link href="/signup">Create a workspace</Link>
      </p>
    </AuthLayout>
  );
}
