import type { CashDrawerSession } from '@/hooks/useCashDrawerSessions';

export function getUserName(session: CashDrawerSession): string {
  if (typeof session.userId === 'object' && session.userId.name) {
    return session.userId.name;
  }
  return 'Unknown';
}

export function getUserEmail(session: CashDrawerSession): string {
  if (typeof session.userId === 'object' && session.userId.email) {
    return session.userId.email;
  }
  return '';
}

export function calculateDifference(session: CashDrawerSession): number | null {
  if (session.closingAmount === undefined || session.expectedAmount === undefined) {
    return null;
  }
  return session.closingAmount - session.expectedAmount;
}

export function getDifferenceColor(difference: number | null): string {
  if (difference === null) return 'text-gray-600';
  return difference >= 0 ? 'text-green-600' : 'text-red-600';
}

export function getStatusBadgeClasses(status: string): string {
  if (status === 'open') {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  return 'bg-gray-100 text-gray-800 border-gray-300';
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
