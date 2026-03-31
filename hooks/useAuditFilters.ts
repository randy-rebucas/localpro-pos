import { useState, useCallback } from 'react';

export interface AuditFilters {
  action: string;
  entityType: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export function useAuditFilters() {
  const [filters, setFilters] = useState<AuditFilters>({
    action: '',
    entityType: '',
    userId: '',
    startDate: '',
    endDate: '',
  });

  const handleFilterChange = useCallback((key: keyof AuditFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      action: '',
      entityType: '',
      userId: '',
      startDate: '',
      endDate: '',
    });
  }, []);

  return {
    filters,
    handleFilterChange,
    resetFilters,
  };
}
