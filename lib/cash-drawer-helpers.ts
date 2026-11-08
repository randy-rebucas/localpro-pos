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

export function getStatusLabel(status: string, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (status === 'open') {
    return dict?.admin?.open || 'Open';
  }
  return dict?.admin?.closed || 'Closed';
}

export function getRefreshSuccessMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.sessionsRefreshed || 'Cash drawer sessions refreshed';
}
