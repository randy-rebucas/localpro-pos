'use client';

import { useState, useCallback } from 'react';

interface NotificationData {
  notifications: Array<{
    type: 'missing_clock_out' | 'late_arrival';
    userId: string;
    userName: string;
    userEmail?: string;
    attendanceId: string;
    clockInTime: string;
    hoursSinceClockIn?: string;
    minutesLate?: number;
    expectedTime?: string;
    message: string;
  }>;
  summary: {
    total: number;
    missingClockOut: number;
    lateArrivals: number;
  };
}

export function useAttendanceNotifications() {
  const [notifications, setNotifications] = useState<NotificationData['notifications']>([]);
  const [summary, setSummary] = useState<NotificationData['summary'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (
      expectedStartTime: string,
      maxHours: string,
      onError?: (msg: string) => void
    ): Promise<NotificationData | null> => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('expectedStartTime', expectedStartTime);
        params.append('maxHoursWithoutClockOut', maxHours);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`/api/attendance/notifications?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Failed to fetch notifications: ${errorText}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch notifications');
        }

        setNotifications(data.data?.notifications || []);
        setSummary(data.data?.summary || null);
        return data.data || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
        setError(message);
        onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    notifications,
    setNotifications,
    summary,
    setSummary,
    loading,
    error,
    fetchNotifications,
  };
}
