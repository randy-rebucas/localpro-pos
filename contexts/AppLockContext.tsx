'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';

const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_APP_LOCK_IDLE_MINUTES ?? 5);
const IDLE_MS = IDLE_MINUTES > 0 ? IDLE_MINUTES * 60 * 1000 : 0;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

interface AppLockContextType {
  isLocked: boolean;
  hasPinSet: boolean | null; // null = still loading
  lock: () => void;
  unlock: () => void;
  refreshPinStatus: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [hasPinSet, setHasPinSet] = useState<boolean | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => setIsLocked(true), []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    resetIdleTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshPinStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/pin', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setHasPinSet(data.data.hasPinSet);
    } catch {
      // non-fatal — fall back to password mode
      setHasPinSet(false);
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!IDLE_MS) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(lock, IDLE_MS);
  }, [lock]);

  // Fetch PIN status whenever the authenticated user changes
  useEffect(() => {
    if (isAuthenticated && user) {
      refreshPinStatus();
    } else {
      setHasPinSet(null);
      setIsLocked(false);
    }
  }, [isAuthenticated, user, refreshPinStatus]);

  // Idle timer — only when authenticated and idle locking is enabled
  useEffect(() => {
    if (!isAuthenticated || !IDLE_MS) return;

    const onActivity = () => {
      if (!isLocked) resetIdleTimer();
    };

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [isAuthenticated, isLocked, resetIdleTimer]);

  // Stop the timer while locked so it doesn't fire repeatedly
  useEffect(() => {
    if (isLocked && idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, [isLocked]);

  return (
    <AppLockContext.Provider value={{ isLocked, hasPinSet, lock, unlock, refreshPinStatus }}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
