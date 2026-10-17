'use client';

import { useEffect, useState } from 'react';
import { EmployeeProfileView, ProfileSkeleton } from '@/components/employee-profile';
import { Banner, Empty } from '@/components/ui/page';
import { api, ApiError, Employee, Profile } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Self view of screen 09: the same layout, with the person's own edit rights. */
export default function MyProfilePage() {
  const { me } = useSession();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me.employee) return;
    Promise.all([api<Employee>(`/employees/${me.employee.id}`), api<Profile>('/me/profile')])
      .then(([e, p]) => {
        setEmployee(e);
        setProfile(p);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.'),
      );
  }, [me.employee]);

  if (!me.employee) return <Empty>Your login isn’t linked to an employee record yet.</Empty>;
  if (error) return <Banner>{error}</Banner>;
  if (!employee) return <ProfileSkeleton />;

  return (
    <EmployeeProfileView
      self
      employee={employee}
      profile={profile}
      editable
      onProfileSaved={setProfile}
    />
  );
}
