'use client';

import { loginSchema } from '@hrms/shared';
import { ArrowRight, Building2, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { BrandPanel } from '@/components/auth-layout';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, FormError, IconInput } from '@/components/ui/input';
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
                <Checkbox label="Keep me signed in" name="remember" defaultChecked />
                <a
                  href="#"
                  title="Coming soon"
                  className="text-[13.5px] font-semibold"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot password?
                </a>
              </div>
              <Button variant="primary" size="lg" className="w-full" type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
              <span className="h-px grow bg-surface-2" />
              or continue with
              <span className="h-px grow bg-surface-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button disabled title="Coming soon">
                Google
              </Button>
              <Button disabled title="Coming soon">
                Microsoft
              </Button>
            </div>
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" />
              Single sign-on (SAML) available for your company
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Protected by 256-bit encryption · Data stored in India
        </p>
      </main>
    </div>
  );
}
