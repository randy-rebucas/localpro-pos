'use client';

import { useState, useCallback } from 'react';

export function useAttendanceFilters() {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const initializeDateRange = useCallback((): { startDate: string; endDate: string } => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    const endDate = end.toISOString().split('T')[0];
    const startDate = start.toISOString().split('T')[0];

    return { startDate, endDate };
  }, []);

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
