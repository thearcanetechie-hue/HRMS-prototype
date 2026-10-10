'use client';

import { useEffect, useState } from 'react';
import { ProfileForm } from '@/components/profile-form';
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
      <div className="page-h">
        <div>
          <p className="eyebrow">{me.employee?.employeeCode}</p>
          <h1>My profile</h1>
          <p>
            Keep your details current. HR uses them for payroll, statutory filings and emergencies.
          </p>
        </div>
      </div>
      {error && <div className="banner">{error}</div>}
      {profile && <ProfileForm employeeId="me" profile={profile} editable onSaved={setProfile} />}
    </>
  );
}
