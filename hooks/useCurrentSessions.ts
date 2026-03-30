'use client';

import { useState, useCallback } from 'react';
import { AttendanceRecord } from './useAttendance';

interface User {
  _id: string;
  name: string;
  email: string;
}

export function useCurrentSessions() {
  const [currentSessions, setCurrentSessions] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCurrentSessions = useCallback(
    async (users: User[]): Promise<AttendanceRecord[]> => {
      setLoading(true);
      const sessions: AttendanceRecord[] = [];

      try {
        for (const user of users) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(`/api/attendance/current?userId=${user._id}`, {
              credentials: 'include',
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
              const data = await res.json();
              if (data.success && data.data) {
                sessions.push({ ...data.data, userId: user });
              }
            }
          } catch (err) {
            // Skip if error fetching for this user
            console.debug(`Failed to fetch session for user ${user._id}:`, err);
          }
        }
        setCurrentSessions(sessions);
        return sessions;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const calculateSessionHours = useCallback((clockIn: string): number => {
    const clockInTime = new Date(clockIn);
    const now = new Date();
    return (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
  }, []);

  return {
    currentSessions,
    setCurrentSessions,
    loading,
    fetchCurrentSessions,
    calculateSessionHours,
  };
}
