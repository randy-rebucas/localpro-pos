'use client';

import { useState, useCallback } from 'react';

interface Notification {
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
}

export function useSendNotificationEmails() {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendEmails = useCallback(
    async (
      notifications: Notification[],
      expectedStartTime: string,
      maxHours: string,
      onSuccess?: (sent: number, failed: number) => void,
      onError?: (msg: string) => void
    ): Promise<boolean> => {
      // Validate there are notifications with emails
      const notificationsWithEmail = notifications.filter((n) => n.userEmail);
      if (notificationsWithEmail.length === 0) {
        const message = 'No email addresses found for notifications';
        setSendError(message);
        onError?.(message);
        return false;
      }

      setSending(true);
      setSendError(null);

      try {
        const params = new URLSearchParams();
        params.append('expectedStartTime', expectedStartTime);
        params.append('maxHoursWithoutClockOut', maxHours);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for email sending

        const res = await fetch(`/api/attendance/notifications?${params}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          // The server rebuilds recipients and wording itself; ids only narrow the list.
          body: JSON.stringify({ attendanceIds: notificationsWithEmail.map((n) => n.attendanceId) }),
        });
        clearTimeout(timeoutId);

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to send emails (HTTP ${res.status})`);
        }

        onSuccess?.(data.results?.sent ?? 0, data.results?.failed ?? 0);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send emails';
        setSendError(message);
        onError?.(message);
        return false;
      } finally {
        setSending(false);
      }
    },
    []
  );

  return {
    sending,
    sendError,
    sendEmails,
  };
}
