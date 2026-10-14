'use client';

import { signupSchema } from '@hrms/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input } from '@/components/ui/input';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { FieldErrors, firstErrors, validate } from '@/lib/forms';

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/(pvt|private|ltd|limited|llp|inc)\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export default function SignupPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [workspaceEdited, setWorkspaceEdited] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const { data, errors } = validate(
      signupSchema,
      Object.fromEntries(new FormData(e.currentTarget)),
    );
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAccessToken(accessToken);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ workspace: err.message });
      else if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(firstErrors(err.fieldErrors));
      else setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Set up your company in a minute. You'll be its owner."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field id="companyName" label="Company name" error={errors.companyName}>
          <Input
            id="companyName"
            name="companyName"
            autoComplete="organization"
            required
            onChange={(e) => !workspaceEdited && setWorkspace(toSlug(e.target.value))}
          />
        </Field>
        <Field id="workspace" label="Workspace address" error={errors.workspace}>
          <Input
            id="workspace"
            name="workspace"
            value={workspace}
            onChange={(e) => {
              setWorkspaceEdited(true);
              setWorkspace(e.target.value);
            }}
            required
          />
        </Field>
        <Field id="fullName" label="Your name" error={errors.fullName}>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </Field>
        <Field id="email" label="Work email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field id="password" label="Password" error={errors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        <FormError>{formError}</FormError>
        <Button variant="primary" size="lg" className="w-full" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create workspace'}
        </Button>
      </form>
      <p className="mt-5 text-center text-muted-foreground">
        Already have a workspace? <Link href="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
