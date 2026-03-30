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

export function formatAuditTimestamp(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

export function getActionBadgeClass(action: string): string {
  const baseClass = 'px-2 py-1 text-xs font-semibold border';
  
  switch (action.toLowerCase()) {
    case 'create':
      return `${baseClass} border-green-300 bg-green-100 text-green-800`;
    case 'update':
      return `${baseClass} border-blue-300 bg-blue-100 text-blue-800`;
    case 'delete':
      return `${baseClass} border-red-300 bg-red-100 text-red-800`;
    case 'view':
      return `${baseClass} border-gray-300 bg-gray-100 text-gray-800`;
    case 'login':
      return `${baseClass} border-yellow-300 bg-yellow-100 text-yellow-800`;
    case 'logout':
      return `${baseClass} border-purple-300 bg-purple-100 text-purple-800`;
    default:
      return `${baseClass} border-blue-300 bg-blue-100 text-blue-800`;
  }
}

export function formatEntityId(entityId: string | undefined): string {
  if (!entityId) return '-';
  // Show last 12 characters if ID is very long
  if (entityId.length > 20) {
    return entityId.substring(entityId.length - 12);
  }
  return entityId;
}

export function formatIpAddress(ipAddress: string | undefined): string {
  return ipAddress || '-';
}

export function getPaginationInfo(
  page: number,
  limit: number,
  total: number,
  dict: any // eslint-disable-line @typescript-eslint/no-explicit-any
): string {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  
  return `${dict?.admin?.showing || 'Showing'} ${start} ${dict?.admin?.to || 'to'} ${end} ${dict?.admin?.of || 'of'} ${total} ${dict?.admin?.results || 'results'}`;
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
