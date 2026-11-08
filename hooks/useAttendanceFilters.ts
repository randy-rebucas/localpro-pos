'use client';

import { useState, useCallback } from 'react';
import { getTenantDateString } from '@/lib/timezone';

/** `timeZone` is the store's, so "the last 30 days" ends on the store's today. */
export function useAttendanceFilters(timeZone?: string) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const initializeDateRange = useCallback((): { startDate: string; endDate: string } => {
    return { startDate: getTenantDateString(timeZone, 30), endDate: getTenantDateString(timeZone) };
  }, [timeZone]);

  const resetFilters = useCallback(() => {
    setSelectedUserId('');
    const { startDate, endDate } = initializeDateRange();
    setStartDate(startDate);
    setEndDate(endDate);
  }, [initializeDateRange]);

  return {
    selectedUserId,
    setSelectedUserId,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    initializeDateRange,
    resetFilters,
  };
}
