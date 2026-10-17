'use client';

import {
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  Globe,
  Heart,
  Loader2,
  MapPin,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { OnboardingLayout } from '@/components/onboarding-layout';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field, FormError, IconInput, Input, Label, Select } from '@/components/ui/input';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { FieldErrors, firstErrors } from '@/lib/forms';
import {
  getOnboardingPassword,
  loadOnboarding,
  ONBOARDING_ROUTES,
  saveOnboarding,
  type OnboardingAbout,
  type OnboardingCompany,
} from '@/lib/onboarding';

const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];
const INDUSTRIES = ['IT & software', 'Manufacturing', 'Retail', 'Healthcare', 'Finance', 'Other'];
const STATES = [
  'Andhra Pradesh',
  'Assam',
  'Delhi',
  'Gujarat',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Tamil Nadu',
  'Telangana',
  'West Bengal',
];
const MODULES: [string, LucideIcon][] = [
  ['Attendance & leave', CalendarDays],
  ['Payroll', Wallet],
  ['Documents', FileText],
  ['Performance', Target],
  ['Learning', GraduationCap],
  ['Engagement', Heart],
];

function nextMonths(n: number) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) =>
    new Date(d.getFullYear(), d.getMonth() + i + 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  );
}

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export default function OnboardingCompanyPage() {
  const router = useRouter();
  const months = nextMonths(6);
  const [about, setAbout] = useState<OnboardingAbout | null>(null);
  const [c, setC] = useState<OnboardingCompany>({
    companyName: '',
    workspace: '',
    size: '51–200',
    industry: 'IT & software',
    city: '',
    state: 'Karnataka',
    pan: '',
    payrollStart: months[0] ?? '',
    modules: ['Attendance & leave', 'Payroll', 'Documents', 'Engagement'],
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = loadOnboarding();
    if (!saved.about) return router.replace(ONBOARDING_ROUTES[1]);
    setAbout(saved.about);
    if (saved.company) {
      setC(saved.company);
      setSlugEdited(true);
    }
    const p = getOnboardingPassword();
    setPassword(p);
    setNeedPassword(!p);
  }, [router]);

  const set = <K extends keyof OnboardingCompany>(k: K, v: OnboardingCompany[K]) =>
    setC((prev) => ({ ...prev, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!about) return;
    setFormError('');
    setErrors({});
    setBusy(true);
    saveOnboarding({ company: c });
    try {
      const { accessToken } = await api<{ accessToken: string }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          companyName: c.companyName,
          workspace: c.workspace,
          fullName: about.fullName,
          email: about.email,
          password,
        }),
      });
      setAccessToken(accessToken);
      saveOnboarding({ step: 3 });
      router.push(ONBOARDING_ROUTES[3]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ workspace: err.message });
      else if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(firstErrors(err.fieldErrors));
      else setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <OnboardingLayout
      step={2}
      title="About your company"
      description="This sets up your workspace, payroll rules and holiday calendar."
      onSaveAndExit={() => {
        saveOnboarding({ step: 2, company: c });
        router.push('/');
      }}
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="companyName" label="Company name" error={errors.companyName}>
            <IconInput
              icon={<Building2 />}
              id="companyName"
              value={c.companyName}
              onChange={(e) => {
                set('companyName', e.target.value);
                if (!slugEdited) set('workspace', toSlug(e.target.value));
              }}
              autoComplete="organization"
              placeholder="Acme Technologies Pvt Ltd"
              required
            />
          </Field>
          <Field id="workspace" label="Workspace address" error={errors.workspace}>
            <div className="relative">
              <IconInput
                icon={<Globe />}
                id="workspace"
                value={c.workspace}
                onChange={(e) => {
                  setSlugEdited(true);
                  set('workspace', toSlug(e.target.value));
                }}
                className="pr-24"
                placeholder="acme"
                required
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted-foreground">
                .hrms.in
              </span>
            </div>
          </Field>
        </div>

        <div className="grid gap-2.5">
          <Label>Company size</Label>
          <div className="flex flex-wrap gap-2.5">
            {SIZES.map((s) => (
              <Chip key={s} active={c.size === s} onClick={() => set('size', s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid gap-2.5">
          <Label>Industry</Label>
          <div className="flex flex-wrap gap-2.5">
            {INDUSTRIES.map((s) => (
              <Chip key={s} active={c.industry === s} onClick={() => set('industry', s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="city" label="Head office city">
            <IconInput
              icon={<MapPin />}
              id="city"
              value={c.city}
              onChange={(e) => set('city', e.target.value)}
              autoComplete="address-level2"
              placeholder="Bengaluru"
            />
          </Field>
          <Field id="state" label="State for professional tax">
            <Select id="state" value={c.state} onChange={(e) => set('state', e.target.value)}>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field id="pan" label="Company PAN (optional)">
            <Input
              id="pan"
              value={c.pan}
              onChange={(e) => set('pan', e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={10}
              placeholder="AAACA1234F"
            />
          </Field>
          <Field id="payrollStart" label="Payroll starts from">
            <Select
              id="payrollStart"
              value={c.payrollStart}
              onChange={(e) => set('payrollStart', e.target.value)}
            >
              {months.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-2.5">
          <Label>Switch on modules (change any time)</Label>
          <div className="flex flex-wrap gap-2.5">
            {MODULES.map(([m, Icon]) => {
              const on = c.modules.includes(m);
              return (
                <Chip
                  key={m}
                  active={on}
                  onClick={() =>
                    set('modules', on ? c.modules.filter((x) => x !== m) : [...c.modules, m])
                  }
                >
                  <Icon /> {m}
                </Chip>
              );
            })}
          </div>
        </div>

        {needPassword && (
          <Field id="password" label="Your password (from step 1)" error={errors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}

        <FormError>{formError}</FormError>
        <div className="flex items-center justify-between gap-3">
          <Link href={ONBOARDING_ROUTES[1]} className="font-bold">
            Back
          </Link>
          <Button variant="primary" size="lg" type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Creating workspace…' : 'Continue'}
          </Button>
        </div>
      </form>
    </OnboardingLayout>
  );
}
