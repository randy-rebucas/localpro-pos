import { AuditLog } from '@/hooks/useAuditLogs';

export interface ActionOption {
  value: string;
  label: string;
}

export function getActionOptions(): ActionOption[] {
  return [
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
    { value: 'view', label: 'View' },
    { value: 'login', label: 'Login' },
    { value: 'logout', label: 'Logout' },
  ];
}

export function extractUserInfo(userId: unknown): { name: string; email: string } {
  if (typeof userId === 'object' && userId !== null) {
    const user = userId as Record<string, unknown>;
    return {
      name: (user.name as string) || 'System',
      email: (user.email as string) || '',
    };
  }
  return { name: 'System', email: '' };
}

export function formatAuditTimestamp(dateString: string, lang: 'en' | 'es' = 'en'): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US') + ' ' + date.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', { hour12: true });
  } catch {
    return dateString;
  }
}

export function formatEntityId(entityId: string | undefined): string {
  if (!entityId) return '—';
  // Show last 12 characters if ID is very long
  if (entityId.length > 20) {
    return entityId.substring(entityId.length - 12);
  }
  return entityId;
}

export function formatIpAddress(ipAddress: string | undefined): string {
  return ipAddress || '—';
}

export function canGoToPreviousPage(page: number): boolean {
  return page > 1;
}

export function canGoToNextPage(page: number, pages: number): boolean {
  return page < pages;
}

export function validateDateRange(startDate: string, endDate: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      errors.push('Start date must be before end date');
    }

    // Check if range is more than 1 year
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 365) {
      errors.push('Date range cannot exceed 1 year');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function isAuditLogEmpty(logs: AuditLog[]): boolean {
  return logs.length === 0;
}

export function shouldShowPagination(pages: number): boolean {
  return pages > 1;
}
