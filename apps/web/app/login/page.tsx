'use client';

import { loginSchema } from '@hrms/shared';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { BrandPanel } from '@/components/auth-layout';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, FormError, IconInput, Input } from '@/components/ui/input';
import { api, ApiError, refreshSession, setAccessToken } from '@/lib/api';
import { FieldErrors, validate } from '@/lib/forms';

const SSO_ERRORS: Record<string, string> = {
  no_account:
    'That account isn’t linked to a login in this workspace. Ask your HR team to invite you with that email.',
  cancelled: 'Sign-in was cancelled.',
  failed: 'That sign-in didn’t work. Try again, or use your password.',
};

type LoginResponse = { accessToken: string } | { mfaRequired: true; challenge: string };

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState(SSO_ERRORS[params.get('sso_error') ?? ''] ?? '');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(params.get('mfa'));
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const [workspace, setWorkspace] = useState(params.get('workspace') ?? '');
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    // Coming back from Google or Microsoft: the refresh cookie is set, so collect the session.
    if (params.get('sso') === 'done')
      void refreshSession().then((ok) =>
        ok ? router.replace('/dashboard') : setFormError(SSO_ERRORS.failed!),
      );
    api<typeof providers>('/auth/providers')
      .then(setProviders)
      .catch(() => undefined);
  }, [params, router]);

  function signedIn(token: string) {
    setAccessToken(token);
    router.replace('/dashboard');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const { data, errors } = validate(loginSchema, { ...form, remember });
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if ('mfaRequired' in res) {
        setChallenge(res.challenge);
        setBusy(false);
      } else signedIn(res.accessToken);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  const sso = (provider: 'google' | 'microsoft') => {
    if (!workspace.trim()) return setErrors({ workspace: 'Enter your workspace first' });
    window.location.href = `/api/auth/oauth/${provider}/start?workspace=${encodeURIComponent(workspace.trim())}&remember=${remember}`;
  };

  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      <main className="flex min-w-0 grow flex-col px-4 py-6 sm:px-16 sm:py-12">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 font-extrabold lg:invisible">
            <Logo /> HRMS
          </div>
          <div className="flex items-center gap-3 text-[13.5px]">
            <span className="hidden text-muted-foreground sm:inline">New to HRMS?</span>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1 font-bold whitespace-nowrap"
            >
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Create a workspace</span>
              <ArrowRight className="size-4" />
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="grid grow place-items-center py-10">
          <div className="grid w-full max-w-[440px] gap-5 rounded-3xl bg-surface p-6 shadow-raised sm:p-9">
            {challenge ? (
              <MfaStep
                challenge={challenge}
                onDone={signedIn}
                onBack={() => {
                  setChallenge(null);
                  router.replace('/login');
                }}
              />
            ) : (
              <>
                <div>
                  <h1 className="text-[28px]">Welcome back</h1>
                  <p className="mt-1 text-muted-foreground">Sign in to your company workspace.</p>
                </div>
                <form onSubmit={onSubmit} noValidate className="grid gap-4">
                  <fieldset disabled={busy} className="grid gap-4">
                    <Field id="workspace" label="Workspace" error={errors.workspace}>
                      <IconInput
                        icon={<Building2 />}
                        id="workspace"
                        name="workspace"
                        autoComplete="organization"
                        placeholder="acme"
                        value={workspace}
                        onChange={(e) => setWorkspace(e.target.value)}
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
                    <Field id="password" label="Password" error={errors.password}>
                      <IconInput
                        icon={<Lock />}
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </Field>
                  </fieldset>
                  <FormError>{formError}</FormError>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Checkbox
                      label="Keep me signed in"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <Link
                      href={`/forgot-password${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''}`}
                      className="text-[13.5px] font-semibold"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    type="submit"
                    disabled={busy}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    {busy ? 'Signing in…' : 'Sign in'}
                  </Button>
                </form>
                {(providers.google || providers.microsoft) && (
                  <>
                    <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                      <span className="h-px grow bg-surface-2" />
                      or continue with
                      <span className="h-px grow bg-surface-2" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {providers.google && <Button onClick={() => sso('google')}>Google</Button>}
                      {providers.microsoft && (
                        <Button onClick={() => sso('microsoft')}>Microsoft</Button>
                      )}
                    </div>
                  </>
                )}
                <p className="text-center text-[13px] text-muted-foreground">
                  Don’t know your workspace? <Link href="/find-workspace">Find it by email</Link>
                </p>
              </>
            )}
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-success" />
          Passwords are stored only as secure hashes, and sensitive details are encrypted.
        </p>
      </main>
    </div>
  );
}

function MfaStep({
  challenge,
  onDone,
  onBack,
}: {
  challenge: string;
  onDone: (token: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
          const { accessToken } = await api<{ accessToken: string }>('/auth/mfa/verify', {
            method: 'POST',
            body: JSON.stringify({ challenge, code }),
          });
          onDone(accessToken);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
          setBusy(false);
        }
      }}
    >
      <div>
        <h1 className="flex items-center gap-2 text-[26px]">
          <KeyRound className="size-6 text-primary" /> Two-step sign-in
        </h1>
        <p className="mt-1 text-muted-foreground">
          {recovery
            ? 'Enter one of the recovery codes you saved.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </div>
      <Field id="code" label={recovery ? 'Recovery code' : 'Code'}>
        <Input
          id="code"
          value={code}
          onChange={(e) =>
            setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))
          }
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          placeholder={recovery ? 'abcde-fghij' : '123456'}
          className="font-mono text-lg tracking-widest"
        />
      </Field>
      <FormError>{error}</FormError>
      <Button
        variant="primary"
        size="lg"
        type="submit"
        disabled={busy || (!recovery && code.length !== 6)}
      >
        {busy && <Loader2 className="animate-spin" />} Verify
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-[13.5px]">
        <button
          type="button"
          className="cursor-pointer font-semibold text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="inline size-4" /> Back
        </button>
        <button
          type="button"
          className="cursor-pointer font-semibold"
          onClick={() => {
            setRecovery(!recovery);
            setCode('');
          }}
        >
          {recovery ? 'Use the app code instead' : 'Use a recovery code'}
        </button>
      </div>
    </form>
  );
}
