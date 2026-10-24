'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const once = useRef(false);
  useEffect(() => {
    // The token works once, so don't send it twice in development's double render.
    if (once.current) return;
    once.current = true;
    if (!token) {
      setState('failed');
      setMessage('This link isn’t complete. Open it from the email again.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => setState('done'))
      .catch((err) => {
        setState('failed');
        setMessage(err instanceof ApiError ? err.message : 'Could not reach the server.');
      });
  }, [token]);

  return (
    <AuthCard
      title={
        state === 'done'
          ? 'Email confirmed'
          : state === 'failed'
            ? 'That didn’t work'
            : 'Confirming your email…'
      }
    >
      {state === 'working' && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
      {state === 'done' && (
        <>
          <p className="flex items-center gap-3 text-[13.5px] text-muted-foreground">
            <CheckCircle2 className="size-6 shrink-0 text-success" /> Thanks. Your email is
            confirmed.
          </p>
          <Button variant="primary" size="lg" asChild>
            <Link href="/dashboard">Go to HRMS</Link>
          </Button>
        </>
      )}
      {state === 'failed' && (
        <>
          <p className="flex items-center gap-3 text-[13.5px] text-muted-foreground">
            <XCircle className="size-6 shrink-0 text-danger" /> {message}
          </p>
          <Link href="/account/security">Send a new link from your account</Link>
        </>
      )}
    </AuthCard>
  );
}
