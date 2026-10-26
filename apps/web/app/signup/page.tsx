'use client';

import { passwordProblem, signupSchema } from '@hrms/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { OnboardingLayout } from '@/components/onboarding-layout';
import { NewPasswordField } from '@/components/password-field';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Checkbox, Field, FormError, IconInput, Input, Label } from '@/components/ui/input';
import { FieldErrors, validate } from '@/lib/forms';
import {
  loadOnboarding,
  ONBOARDING_ROUTES,
  saveOnboarding,
  setOnboardingPassword,
  type OnboardingAbout,
} from '@/lib/onboarding';

const ROLES = ['HR / People team', 'Founder / CEO', 'Finance', 'IT admin'];

const aboutSchema = signupSchema.pick({ fullName: true, email: true, password: true });

export default function SignupAboutPage() {
  const router = useRouter();
  const [about, setAbout] = useState<OnboardingAbout>({
    fullName: '',
    jobTitle: '',
    email: '',
    mobile: '',
    role: 'HR / People team',
  });
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const saved = loadOnboarding();
    if (saved.about) setAbout(saved.about);
  }, []);

  const set = (k: keyof OnboardingAbout) => (v: string) => setAbout((a) => ({ ...a, [k]: v }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const { errors } = validate(aboutSchema, { ...about, password });
    const problem = passwordProblem(password, { email: about.email, name: about.fullName });
    setErrors({ ...(errors ?? {}), ...(problem ? { password: problem } : {}) });
    if (errors || problem) return;
    if (!agreed) return setFormError('Please agree to the Terms and the Privacy policy.');
    setOnboardingPassword(password);
    saveOnboarding({ step: 2, about });
    router.push(ONBOARDING_ROUTES[2]);
  }

  return (
    <OnboardingLayout
      step={1}
      title="Tell us about you"
      description="You will be the first admin of your company workspace."
      onSaveAndExit={() => {
        saveOnboarding({ step: 1, about });
        router.push('/');
      }}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fullName" label="Full name" error={errors.fullName}>
            <Input
              id="fullName"
              value={about.fullName}
              onChange={(e) => set('fullName')(e.target.value)}
              autoComplete="name"
              placeholder="Meera Iyer"
              required
            />
          </Field>
          <Field id="jobTitle" label="Job title">
            <Input
              id="jobTitle"
              value={about.jobTitle}
              onChange={(e) => set('jobTitle')(e.target.value)}
              autoComplete="organization-title"
              placeholder="HR Manager"
            />
          </Field>
          <Field id="email" label="Work email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={about.email}
              onChange={(e) => set('email')(e.target.value)}
              autoComplete="email"
              placeholder="meera@acme.in"
              required
            />
          </Field>
          <Field id="mobile" label="Mobile number">
            <IconInput
              icon="+91"
              id="mobile"
              type="tel"
              className="pl-12"
              value={about.mobile}
              onChange={(e) => set('mobile')(e.target.value)}
              autoComplete="tel-national"
              placeholder="98450 12345"
            />
          </Field>
          <div className="sm:col-span-2">
            <NewPasswordField
              label="Create a password"
              value={password}
              onChange={setPassword}
              context={{ email: about.email, name: about.fullName }}
              error={errors.password}
            />
          </div>
        </div>

        <div className="grid gap-2.5">
          <Label>What best describes your role?</Label>
          <div className="flex flex-wrap gap-2.5" role="group">
            {ROLES.map((r) => (
              <Chip key={r} active={about.role === r} onClick={() => set('role')(r)}>
                {r}
              </Chip>
            ))}
          </div>
        </div>

        <Checkbox
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          label={
            <>
              I agree to the{' '}
              <a href="/terms" target="_blank">
                Terms
              </a>{' '}
              and the{' '}
              <a href="/privacy" target="_blank">
                Privacy notice
              </a>
              , and to my details being processed to run this workspace (DPDP Act 2023)
            </>
          }
        />
        <FormError>{formError}</FormError>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13.5px] text-muted-foreground">
            Already have a workspace? <Link href="/login">Sign in</Link>
          </span>
          <Button variant="primary" size="lg" type="submit">
            Continue
          </Button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
