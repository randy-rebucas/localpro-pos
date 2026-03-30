import { useState, useCallback } from 'react';

export interface AuditLog {
  _id: string;
  tenantId: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
  } | string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface FetchParams {
  page: number;
  limit: number;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export function useAuditLogs() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditPagination>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (params: FetchParams, onError?: (error: string) => void) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      setLoading(true);
      setError(null);

      const searchParams = new URLSearchParams({
        page: params.page.toString(),
        limit: params.limit.toString(),
      });

      if (params.action) searchParams.append('action', params.action);
      if (params.entityType) searchParams.append('entityType', params.entityType);
      if (params.userId) searchParams.append('userId', params.userId);
      if (params.startDate) searchParams.append('startDate', params.startDate);
      if (params.endDate) searchParams.append('endDate', params.endDate);

      const res = await globalThis.fetch(`/api/audit-logs?${searchParams.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch audit logs`);
      }

      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
        setPagination(data.pagination);
      } else {
        const errorMsg = data.error || 'Failed to fetch audit logs';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch audit logs. Please check your connection.';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  return {
    auditLogs,
    pagination,
    loading,
    error,
    fetch: fetchLogs,
  };
}
