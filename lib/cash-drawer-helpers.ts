import type { CashDrawerSession } from '@/hooks/useCashDrawerSessions';

export function getUserName(session: CashDrawerSession): string {
  return session.user?.name || 'Unknown';
}

export function getUserEmail(session: CashDrawerSession): string {
  return session.user?.email || '';
}

export function calculateDifference(session: CashDrawerSession): number | null {
  if (session.closingAmount === undefined || session.expectedAmount === undefined) {
    return null;
  }
  return session.closingAmount - session.expectedAmount;
}

export function getDifferenceColor(difference: number | null): string {
  if (difference === null) return 'text-gray-600';
  return difference >= 0 ? 'text-win8-success' : 'text-win8-danger';
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-win8-success text-white',
  closed: 'bg-gray-500 text-white',
};

export function getStatusBadgeClasses(status: string): string {
  return STATUS_BADGE[status] || 'bg-gray-500 text-white';
}

export function getStatusLabel(status: string, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (status === 'open') {
    return dict?.admin?.open || 'Open';
  }
  return dict?.admin?.closed || 'Closed';
}

export function formatSessionTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return '-';
  }
}

export function hasClosingInfo(session: CashDrawerSession): boolean {
  return session.closingAmount !== undefined && session.expectedAmount !== undefined;
}

export function getRefreshSuccessMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.sessionsRefreshed || 'Cash drawer sessions refreshed';
}

export function getRefreshErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.failedToRefreshSessions || 'Failed to refresh sessions';
}
