import { useState, useCallback } from 'react';

export interface CashDrawerSession {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: string;
  closingTime?: string;
  status: 'open' | 'closed';
  notes?: string;
  totalVAT?: number;
  totalDiscounts?: number;
}

interface UseCashDrawerReturn {
  activeSession: CashDrawerSession | null;
  loading: boolean;
  error: string | null;
  checkActiveSession: () => Promise<CashDrawerSession | null>;
  openDrawer: (openingAmount: number, notes?: string) => Promise<boolean>;
  closeDrawer: (closingAmount: number, notes?: string) => Promise<{ success: boolean; session?: CashDrawerSession; error?: string }>;
}

export function useCashDrawer(): UseCashDrawerReturn {
  const [activeSession, setActiveSession] = useState<CashDrawerSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkActiveSession = useCallback(async (): Promise<CashDrawerSession | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cash-drawer/sessions?status=open', {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.length > 0) {
        const session = data.data[0]; // Most recent open session
        setActiveSession(session);
        return session;
      }
      setActiveSession(null);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check cash drawer';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const openDrawer = useCallback(async (openingAmount: number, notes?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cash-drawer/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', openingAmount, notes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveSession(data.data);
        return true;
      }
      setError(data.error || 'Failed to open cash drawer');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open cash drawer';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(async (closingAmount: number, notes?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cash-drawer/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', closingAmount, notes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveSession(null);
        return { success: true, session: data.data as CashDrawerSession };
      }
      const errorMsg = data.error || 'Failed to close cash drawer';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to close cash drawer';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    activeSession,
    loading,
    error,
    checkActiveSession,
    openDrawer,
    closeDrawer,
  };
}
