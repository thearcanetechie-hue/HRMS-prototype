'use client';

import { createEmployeeSchema, EMPLOYMENT_TYPES } from '@hrms/shared';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { api, ApiError, Named } from '@/lib/api';
import { titleCase as label } from '@/lib/format';
import { FieldErrors, firstErrors, validate } from '@/lib/forms';

/** Side drawer form that creates one employee. Render inside a `Dialog`. */
export function AddEmployee({ onCreated }: { onCreated: () => void }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<{
    departments: Named[];
    designations: Named[];
    locations: Named[];
  }>({
    departments: [],
    designations: [],
    locations: [],
  });

  useEffect(() => {
    Promise.all([
      api<Named[]>('/org/departments'),
      api<Named[]>('/org/designations'),
      api<Named[]>('/org/locations'),
    ])
      .then(([departments, designations, locations]) =>
        setOptions({ departments, designations, locations }),
      )
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const raw = Object.fromEntries(
      [...new FormData(e.currentTarget)].map(([k, v]) => [k, v === '' ? undefined : v]),
    );
    const { data, errors } = validate(createEmployeeSchema, raw);
    setErrors(errors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      await api('/employees', { method: 'POST', body: JSON.stringify(data) });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(firstErrors(err.fieldErrors));
      else setFormError(err instanceof ApiError ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  const select = (name: string, items: Named[]) => (
    <Select id={name} name={name} defaultValue="">
      <option value="">Not set</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </Select>
  );

  return (
    <DialogContent title="Add employee" side="right" aria-describedby={undefined}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="First name" error={errors.firstName}>
          <Input id="firstName" name="firstName" required />
        </Field>
        <Field id="lastName" label="Last name" error={errors.lastName}>
          <Input id="lastName" name="lastName" />
        </Field>
        <Field className="sm:col-span-2" id="workEmail" label="Work email" error={errors.workEmail}>
          <Input id="workEmail" name="workEmail" type="email" required />
        </Field>
        <Field id="employeeCode" label="Employee code" error={errors.employeeCode}>
          <Input id="employeeCode" name="employeeCode" required />
        </Field>
        <Field id="dateOfJoining" label="Date of joining" error={errors.dateOfJoining}>
          <Input id="dateOfJoining" name="dateOfJoining" type="date" required />
        </Field>
        <Field id="phone" label="Phone" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" />
        </Field>
        <Field id="employmentType" label="Employment type" error={errors.employmentType}>
          <Select id="employmentType" name="employmentType" defaultValue="FULL_TIME">
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="departmentId" label="Department" error={errors.departmentId}>
          {select('departmentId', options.departments)}
        </Field>
        <Field id="designationId" label="Designation" error={errors.designationId}>
          {select('designationId', options.designations)}
        </Field>
        <Field className="sm:col-span-2" id="locationId" label="Location" error={errors.locationId}>
          {select('locationId', options.locations)}
        </Field>
        <div className="sm:col-span-2">
          <FormError>{formError}</FormError>
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Add employee'}
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
