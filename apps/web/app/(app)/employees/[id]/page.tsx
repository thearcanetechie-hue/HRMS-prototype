'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmployeeProfileView, ProfileSkeleton } from '@/components/employee-profile';
import { Banner } from '@/components/ui/page';
import { api, ApiError, Employee, Profile } from '@/lib/api';
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
  if (!employee) return <ProfileSkeleton />;

  return (
    <EmployeeProfileView
      employee={employee}
      profile={profile}
      editable={isSelf || can('employee.manage')}
      canInvite={can('employee.manage') && employee.user?.status !== 'ACTIVE'}
      onProfileSaved={setProfile}
    />
  );
}
