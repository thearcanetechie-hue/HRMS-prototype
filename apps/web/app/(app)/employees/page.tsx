'use client';

import { createEmployeeSchema, EMPLOYMENT_TYPES } from '@hrms/shared';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { InviteButton } from '@/components/invite-button';
import { PersonCell } from '@/components/person-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, PageHeader } from '@/components/ui/page';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, ApiError, Employee, Named, Paged } from '@/lib/api';
import { formatDate, STATUS_TONE, titleCase as label } from '@/lib/format';
import { FieldErrors, firstErrors, validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

export default function EmployeesPage() {
  const { can } = useSession();
  // People without employee.read get the directory: no joining date, status or access columns.
  const full = can('employee.read');
  const manage = can('employee.manage');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Paged<Employee> | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ pageSize: '100', ...(search ? { search } : {}) });
      setData(await api<Paged<Employee>>(`/employees?${q}`));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load employees.');
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader
        title={full ? 'Employees' : 'Directory'}
        description={data ? `${data.total} ${data.total === 1 ? 'person' : 'people'}` : 'Loading…'}
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search name, email or code"
                aria-label="Search employees"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {manage && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus /> Add employee
              </Button>
            )}
          </>
        }
      />
      {error && <Banner>{error}</Banner>}
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>Code</TH>
            <TH>Department</TH>
            <TH>Designation</TH>
            <TH>Location</TH>
            {full && <TH>Joined</TH>}
            {full && <TH>Status</TH>}
            {manage && <TH>Access</TH>}
          </tr>
        </THead>
        <TBody>
          {data?.items.map((e) => (
            <TR key={e.id}>
              <TD>
                <PersonCell employee={e} />
              </TD>
              <TD className="font-mono text-[13px]">{e.employeeCode}</TD>
              <TD>{e.department?.name ?? '–'}</TD>
              <TD>{e.designation?.name ?? '–'}</TD>
              <TD>{e.location?.name ?? '–'}</TD>
              {full && (
                <TD className="whitespace-nowrap tabular">
                  {e.dateOfJoining ? formatDate(e.dateOfJoining) : '–'}
                </TD>
              )}
              {full && (
                <TD>{e.status && <Badge tone={STATUS_TONE[e.status]}>{label(e.status)}</Badge>}</TD>
              )}
              {manage && (
                <TD>
                  <InviteButton employee={e} onInvited={() => void load()} />
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
      {data && data.items.length === 0 && <TableEmpty>No one matches that search.</TableEmpty>}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <AddEmployee
            onCreated={() => {
              setAdding(false);
              void load();
            }}
          />
        )}
      </Dialog>
    </>
  );
}
function AddEmployee({ onCreated }: { onCreated: () => void }) {
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
