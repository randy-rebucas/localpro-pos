'use client';

import { useState, useCallback } from 'react';
import { AttendanceRecord } from './useAttendance';

/** Everyone on the clock right now, fetched in one request (manager+ only). */
export function useCurrentSessions() {
  const [currentSessions, setCurrentSessions] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCurrentSessions = useCallback(async (): Promise<AttendanceRecord[]> => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('/api/attendance/current?all=true', {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = res.ok ? await res.json() : null;
      const sessions: AttendanceRecord[] = data?.success && Array.isArray(data.data) ? data.data : [];
      setCurrentSessions(sessions);
      return sessions;
    } catch (err) {
      console.debug('Failed to fetch current sessions:', err);
      return [];
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const calculateSessionHours = useCallback((clockIn: string): number => {
    return (Date.now() - new Date(clockIn).getTime()) / (1000 * 60 * 60);
  }, []);

  return {
    currentSessions,
    setCurrentSessions,
    loading,
    fetchCurrentSessions,
    calculateSessionHours,
  };
}
