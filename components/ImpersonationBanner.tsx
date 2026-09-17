'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function ImpersonationBanner() {
  const { user, logout } = useAuth();

  if (!user?.impersonatedBy) return null;

  return (
    <div className="sticky top-0 z-[100] bg-yellow-400 text-yellow-950 text-sm font-medium px-4 py-2 flex items-center justify-center gap-3">
      <span>Viewing as {user.email} — impersonation session (expires in 1 hour)</span>
      <button onClick={logout} className="underline hover:no-underline">
        End impersonation
      </button>
    </div>
  );
}
