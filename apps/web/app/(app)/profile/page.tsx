'use client';

import { useEffect, useState } from 'react';
import { ProfileForm } from '@/components/profile-form';
import { Banner, PageHeader } from '@/components/ui/page';
import { api, ApiError, Profile } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function MyProfilePage() {
  const { me } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Profile>('/me/profile')
      .then(setProfile)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load your profile.'),
      );
  }, []);

  return (
    <>
      <PageHeader
        eyebrow={me.employee?.employeeCode}
        title="My profile"
        description="Keep your details current. HR uses them for payroll, statutory filings and emergencies."
      />
      {error && <Banner>{error}</Banner>}
      {profile && <ProfileForm employeeId="me" profile={profile} editable onSaved={setProfile} />}
    </>
  );
}
