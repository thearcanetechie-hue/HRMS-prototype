'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { InviteButton } from '@/components/invite-button';
import { ProfileForm } from '@/components/profile-form';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { api, ApiError, Employee, Profile } from '@/lib/api';
import { formatDate, initials, STATUS_TONE, titleCase } from '@/lib/format';
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

  if (error) return <Banner>{error}</Banner>;
  if (!employee) return <Empty>Loading…</Empty>;

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
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> People
      </Link>
      <PageHeader
        leading={<Avatar size="lg" initials={initials(employee.firstName, employee.lastName)} />}
        title={`${employee.firstName} ${employee.lastName}`}
        description={`${employee.designation?.name ?? 'No designation'}${
          employee.department ? ` · ${employee.department.name}` : ''
        }`}
        actions={
          <>
            {employee.status && (
              <Badge tone={STATUS_TONE[employee.status]}>{titleCase(employee.status)}</Badge>
            )}
            {can('employee.manage') && <InviteButton employee={employee} />}
          </>
        }
      />
      <Card className="mb-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-xs font-bold text-muted-foreground">{k}</div>
              <div className="truncate font-semibold">{v || '–'}</div>
            </div>
          ))}
      </Card>
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
