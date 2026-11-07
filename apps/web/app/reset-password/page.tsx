'use client';

import { passwordProblem } from '@hrms/shared';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { NewPasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords don’t match');
    setBusy(true);
    try {
      const r = await api<{ workspace: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(r.workspace);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  if (!token)
    return (
      <AuthCard
        title="This link isn’t complete"
        description="Open the link from the email again, or ask for a new one."
      >
        <Link href="/forgot-password">Send a new link</Link>
      </AuthCard>
    );
  if (done)
    return (
      <AuthCard title="Password changed">
        <p className="flex items-center gap-3 text-[13.5px] text-muted-foreground">
          <CheckCircle2 className="size-6 shrink-0 text-success" />
          You’re signed out everywhere else. Sign in with your new password.
        </p>
        <Button variant="primary" size="lg" asChild>
          <Link href={`/login?workspace=${encodeURIComponent(done)}`}>Sign in</Link>
        </Button>
      </AuthCard>
    );
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <NewPasswordField value={password} onChange={setPassword} />
        <NewPasswordField
          id="confirm"
          label="Type it again"
          value={confirm}
          onChange={setConfirm}
        />
        <FormError>{error}</FormError>
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Change password
        </Button>
      </form>
    </AuthCard>
  );
}
