'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ProfileUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  lastLogin?: string;
  qrToken: string | null;
  tenantId?: string | null;
  tenantSlug?: string | null;
  tenantName?: string | null;
}

export type ProfileStatus = 'loading' | 'ready' | 'error';

export function useProfilePage() {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/auth/profile', { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.user) {
        setProfile(data.user as ProfileUser);
        setStatus('ready');
      } else {
        setProfile(null);
        setError(data.error || 'Failed to load profile');
        setStatus('error');
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
      setError('Failed to load profile');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { profile, setProfile, status, error, refetch };
}
