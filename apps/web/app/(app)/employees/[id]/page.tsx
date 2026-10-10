'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { InviteButton } from '@/components/invite-button';
import { ProfileForm } from '@/components/profile-form';
import { api, ApiError, Employee, Profile } from '@/lib/api';
import { formatDate, initials, STATUS_PILL, titleCase } from '@/lib/format';
import { useSession } from '@/lib/session';

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { me, can } = useSession();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const isSelf = me.employee?.id === id;

  useEffect(() => {
    api<Employee>(`/employees/${id}`)
      .then((e) => {
        setEmployee(e);
        // Directory entries have no dateOfJoining: the viewer can't see this person's profile.
        if (e.dateOfJoining)
          api<Profile>(`/employees/${id}/profile`)
            .then(setProfile)
            .catch(() => undefined);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load this person.'),
      );
  }, [id]);

  if (error) return <div className="banner">{error}</div>;
  if (!employee) return <div className="empty">Loading…</div>;

  const facts: [string, string | undefined | null][] = [
    ['Code', employee.employeeCode],
    ['Work email', employee.workEmail],
    ['Phone', employee.phone],
    ['Department', employee.department?.name],
    ['Designation', employee.designation?.name],
    ['Location', employee.location?.name],
    ['Manager', employee.manager && `${employee.manager.firstName} ${employee.manager.lastName}`],
    ['Joined', employee.dateOfJoining && formatDate(employee.dateOfJoining)],
    ['Employment', employee.employmentType && titleCase(employee.employmentType)],
  ];

  return (
    <>
      <p style={{ margin: '0 0 10px' }}>
        <Link href="/employees" className="muted">
          ← People
        </Link>
      </p>
      <div className="page-h">
        <div className="who" style={{ gap: 14 }}>
          <div className="avatar">{initials(employee.firstName, employee.lastName)}</div>
          <div>
            <h1>
              {employee.firstName} {employee.lastName}
            </h1>
            <p>
              {employee.designation?.name ?? 'No designation'}
              {employee.department ? ` · ${employee.department.name}` : ''}
            </p>
          </div>
        </div>
        <div className="actions">
          {employee.status && (
            <span className={`pill ${STATUS_PILL[employee.status]}`}>
              {titleCase(employee.status)}
            </span>
          )}
          {can('employee.manage') && <InviteButton employee={employee} />}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="grid g3" style={{ gap: 14 }}>
          {facts
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => (
              <div key={k}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  {k}
                </div>
                <div>{v || '–'}</div>
              </div>
            ))}
        </div>
      </div>
      {profile && (
        <ProfileForm
          employeeId={id}
          profile={profile}
          editable={isSelf || can('employee.manage')}
          onSaved={setProfile}
        />
      )}
    </>
  );
}
