'use client';

import { BLOOD_GROUPS, GENDERS, MARITAL_STATUSES, profileSchema } from '@hrms/shared';
import { FormEvent, ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { api, ApiError, Address, IdentifierKey, Profile } from '@/lib/api';
import { titleCase } from '@/lib/format';
import { FieldErrors, firstErrors, validate } from '@/lib/forms';

const IDENTIFIERS: [IdentifierKey, string][] = [
  ['pan', 'PAN'],
  ['aadhaar', 'Aadhaar'],
  ['uan', 'UAN (PF)'],
  ['esicNumber', 'ESIC number'],
];
const ADDRESS_FIELDS: [keyof Address, string][] = [
  ['line1', 'Address line 1'],
  ['line2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['pincode', 'PIN code'],
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

const masked = (last4: string | null) => (last4 ? `•••• ${last4}` : 'Not added');

/**
 * Personal, address, emergency, statutory and bank details. Identifiers are
 * write-only unless the viewer may see them: leaving the box empty keeps the
 * stored value, typing replaces it.
 */
export function ProfileForm({
  employeeId,
  profile,
  editable,
  onSaved,
}: {
  employeeId: string | 'me';
  profile: Profile;
  editable: boolean;
  onSaved: (p: Profile) => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sameAddress, setSameAddress] = useState(false);
  const contact = profile.emergencyContacts[0];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const address = (prefix: string): Address | null => {
      const a = Object.fromEntries(
        ADDRESS_FIELDS.map(([k]) => [k, text(`${prefix}.${k}`)]),
      ) as unknown as Address;
      return Object.values(a).some(Boolean) ? a : null;
    };
    const current = address('current');
    const payload: Record<string, unknown> = {
      dateOfBirth: text('dateOfBirth'),
      gender: text('gender') || null,
      maritalStatus: text('maritalStatus') || null,
      bloodGroup: text('bloodGroup') || null,
      personalEmail: text('personalEmail'),
      personalPhone: text('personalPhone'),
      currentAddress: current,
      permanentAddress: sameAddress ? current : address('permanent'),
      emergencyContacts: text('ec.name')
        ? [{ name: text('ec.name'), relation: text('ec.relation'), phone: text('ec.phone') }]
        : [],
      bankIfsc: text('bankIfsc'),
      bankName: text('bankName'),
      bankAccountHolder: text('bankAccountHolder'),
    };
    for (const [key] of [...IDENTIFIERS, ['bankAccountNumber']] as [IdentifierKey][]) {
      const value = text(key);
      if (value && value !== profile.identifiers[key].value) payload[key] = value;
    }

    const { data, errors } = validate(profileSchema, payload);
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      const path = employeeId === 'me' ? '/me/profile' : `/employees/${employeeId}/profile`;
      onSaved(await api<Profile>(path, { method: 'PUT', body: JSON.stringify(data) }));
      setMessage({ ok: true, text: 'Saved' });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(firstErrors(err.fieldErrors));
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  const input = (
    name: string,
    defaultValue?: string | null,
    props: Record<string, unknown> = {},
  ) => (
    <Input
      id={name}
      name={name}
      defaultValue={defaultValue ?? ''}
      disabled={!editable}
      {...props}
    />
  );
  const select = (name: string, options: readonly string[], value: string | null) => (
    <Select id={name} name={name} defaultValue={value ?? ''} disabled={!editable}>
      <option value="">Not set</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o.length <= 3 ? o : titleCase(o)}
        </option>
      ))}
    </Select>
  );
  const identifier = (key: IdentifierKey, label: string) => {
    const id = profile.identifiers[key];
    return (
      <Field key={key} id={key} label={label} error={errors[key]}>
        {input(key, profile.unmasked ? id.value : '', {
          placeholder: profile.unmasked ? 'Not added' : masked(id.last4),
          autoComplete: 'off',
          spellCheck: false,
        })}
      </Field>
    );
  };
  const addressBlock = (prefix: string, value: Address | null, error?: string) =>
    ADDRESS_FIELDS.map(([k, label]) => (
      <Field
        key={k}
        id={`${prefix}.${k}`}
        label={label}
        error={k === 'line1' ? error : undefined}
        className={k.startsWith('line') ? 'sm:col-span-2' : undefined}
      >
        {input(`${prefix}.${k}`, value?.[k])}
      </Field>
    ));

  return (
    <form
      // Remount the uncontrolled inputs after a save so they show the stored (normalised) values.
      key={profile.updatedAt ?? 'new'}
      onSubmit={onSubmit}
      noValidate
      className="grid gap-6"
    >
      <Section title="Personal">
        <Field id="dateOfBirth" label="Date of birth" error={errors.dateOfBirth}>
          {input('dateOfBirth', profile.dateOfBirth?.slice(0, 10), { type: 'date' })}
        </Field>
        <Field id="gender" label="Gender">
          {select('gender', GENDERS, profile.gender)}
        </Field>
        <Field id="maritalStatus" label="Marital status">
          {select('maritalStatus', MARITAL_STATUSES, profile.maritalStatus)}
        </Field>
        <Field id="bloodGroup" label="Blood group">
          {select('bloodGroup', BLOOD_GROUPS, profile.bloodGroup)}
        </Field>
        <Field id="personalEmail" label="Personal email" error={errors.personalEmail}>
          {input('personalEmail', profile.personalEmail, { type: 'email' })}
        </Field>
        <Field id="personalPhone" label="Personal phone" error={errors.personalPhone}>
          {input('personalPhone', profile.personalPhone, { type: 'tel' })}
        </Field>
      </Section>

      <Section title="Current address">
        {addressBlock('current', profile.currentAddress, errors.currentAddress)}
      </Section>

      <Section title="Permanent address">
        <label className="flex items-center gap-2.5 font-semibold sm:col-span-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={sameAddress}
            onChange={(e) => setSameAddress(e.target.checked)}
            disabled={!editable}
          />
          Same as current address
        </label>
        {!sameAddress &&
          addressBlock('permanent', profile.permanentAddress, errors.permanentAddress)}
      </Section>

      <Section title="Emergency contact">
        <Field id="ec.name" label="Name" error={errors.emergencyContacts}>
          {input('ec.name', contact?.name)}
        </Field>
        <Field id="ec.relation" label="Relation">
          {input('ec.relation', contact?.relation)}
        </Field>
        <Field id="ec.phone" label="Phone" className="sm:col-span-2">
          {input('ec.phone', contact?.phone, { type: 'tel' })}
        </Field>
      </Section>

      <Section title="Statutory IDs" note="Encrypted. Visible only to you and HR.">
        {IDENTIFIERS.map(([k, l]) => identifier(k, l))}
      </Section>

      <Section title="Bank account" note="Used for salary payouts.">
        {identifier('bankAccountNumber', 'Account number')}
        <Field id="bankIfsc" label="IFSC" error={errors.bankIfsc}>
          {input('bankIfsc', profile.bankIfsc)}
        </Field>
        <Field id="bankName" label="Bank name">
          {input('bankName', profile.bankName)}
        </Field>
        <Field id="bankAccountHolder" label="Account holder name">
          {input('bankAccountHolder', profile.bankAccountHolder)}
        </Field>
      </Section>

      {editable && (
        <div className="flex items-center gap-4">
          <Button variant="primary" size="lg" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
          {message &&
            (message.ok ? (
              <Badge role="status" tone="success">
                {message.text}
              </Badge>
            ) : (
              <FormError>{message.text}</FormError>
            ))}
        </div>
      )}
    </form>
  );
}
