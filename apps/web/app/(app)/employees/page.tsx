'use client';

import { createEmployeeSchema, EMPLOYMENT_TYPES } from '@hrms/shared';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Field } from '@/components/auth-layout';
import { Icon } from '@/components/icon';
import { api, ApiError, Employee, Named, Paged } from '@/lib/api';
import { FieldErrors, firstErrors, validate } from '@/lib/forms';
import { useSession } from '@/lib/session';

const STATUS_PILL: Record<Employee['status'], string> = {
  ACTIVE: 'good',
  ONBOARDING: 'acc',
  ON_NOTICE: 'warn',
  EXITED: 'bad',
};

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export default function EmployeesPage() {
  const { can } = useSession();
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
      <div className="page-h">
        <div>
          <h1>Employees</h1>
          <p>{data ? `${data.total} ${data.total === 1 ? 'person' : 'people'}` : 'Loading…'}</p>
        </div>
        <div className="actions">
          <div className="search" style={{ display: 'block', minWidth: 240 }}>
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder="Search name, email or code"
              aria-label="Search employees"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can('employee.manage') && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Add employee
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="banner" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Code</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Location</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="who">
                      <div className="avatar sm alt">
                        {(e.firstName[0] ?? '') + (e.lastName[0] ?? '')}
                      </div>
                      <div>
                        <div className="n">
                          {e.firstName} {e.lastName}
                        </div>
                        <div className="e">{e.workEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{e.employeeCode}</td>
                  <td>{e.department?.name ?? '–'}</td>
                  <td>{e.designation?.name ?? '–'}</td>
                  <td>{e.location?.name ?? '–'}</td>
                  <td className="num">
                    {new Date(e.dateOfJoining).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[e.status]}`}>{label(e.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.items.length === 0 && (
            <div className="empty">No one matches that search.</div>
          )}
        </div>
      </div>
      {adding && (
        <AddEmployee
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function AddEmployee({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <select className="input" id={name} name={name} defaultValue="">
      <option value="">Not set</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="card-h">
          <h3 id="add-title">Add employee</h3>
          <button className="btn icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <form onSubmit={onSubmit} noValidate className="form-grid">
          <Field id="firstName" label="First name" error={errors.firstName}>
            <input className="input" id="firstName" name="firstName" required />
          </Field>
          <Field id="lastName" label="Last name" error={errors.lastName}>
            <input className="input" id="lastName" name="lastName" />
          </Field>
          <div className="full">
            <Field id="workEmail" label="Work email" error={errors.workEmail}>
              <input className="input" id="workEmail" name="workEmail" type="email" required />
            </Field>
          </div>
          <Field id="employeeCode" label="Employee code" error={errors.employeeCode}>
            <input className="input" id="employeeCode" name="employeeCode" required />
          </Field>
          <Field id="dateOfJoining" label="Date of joining" error={errors.dateOfJoining}>
            <input className="input" id="dateOfJoining" name="dateOfJoining" type="date" required />
          </Field>
          <Field id="phone" label="Phone" error={errors.phone}>
            <input className="input" id="phone" name="phone" type="tel" />
          </Field>
          <Field id="employmentType" label="Employment type" error={errors.employmentType}>
            <select
              className="input"
              id="employmentType"
              name="employmentType"
              defaultValue="FULL_TIME"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="departmentId" label="Department" error={errors.departmentId}>
            {select('departmentId', options.departments)}
          </Field>
          <Field id="designationId" label="Designation" error={errors.designationId}>
            {select('designationId', options.designations)}
          </Field>
          <div className="full">
            <Field id="locationId" label="Location" error={errors.locationId}>
              {select('locationId', options.locations)}
            </Field>
          </div>
          <div className="err full" role="alert">
            {formError}
          </div>
          <div className="actions full">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Add employee'}
            </button>
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
