'use client';

import { useState, useCallback } from 'react';

export interface AttendanceRecord {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  clockIn: string;
  clockOut?: string;
  breakStart?: string;
  breakEnd?: string;
  totalHours?: number;
  notes?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  createdAt: string;
}

interface FetchAttendanceParams {
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useAttendance() {
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendances = useCallback(
    async (
      params: FetchAttendanceParams,
      onError?: (msg: string) => void
    ): Promise<AttendanceRecord[]> => {
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (params.userId) queryParams.append('userId', params.userId);
        if (params.startDate) queryParams.append('startDate', params.startDate);
        if (params.endDate) queryParams.append('endDate', params.endDate);
        queryParams.append('limit', String(params.limit || 100));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`/api/attendance?${queryParams}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Failed to fetch attendance: ${errorText}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch attendance records');
        }

        setAttendances(data.data || []);
        return data.data || [];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch attendance records';
        setError(message);
        onError?.(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const calculateTotalHours = useCallback((records: AttendanceRecord[]): number => {
    return records.reduce((total, att) => total + (att.totalHours || 0), 0);
  }, []);

  const formatHours = useCallback((hours?: number): string => {
    if (!hours) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }, []);

  return {
    attendances,
    setAttendances,
    loading,
    error,
    fetchAttendances,
    calculateTotalHours,
    formatHours,
  };
}
