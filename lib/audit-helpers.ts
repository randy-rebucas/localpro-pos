import type { AuditLog } from '@/hooks/useAuditLogs';

/**
 * Every action code the server writes (the values of `AuditActions` in lib/audit.ts).
 * Kept here because lib/audit.ts pulls in the database and cannot load in the browser;
 * __tests__/lib/audit-helpers.test.ts keeps the two lists equal.
 */
export const AUDIT_ACTION_CODES = [
  'create', 'update', 'delete', 'view', 'login', 'logout',
  'transaction.create', 'transaction.cancel', 'transaction.refund', 'transaction.export',
  'stock.adjust', 'stock.purchase',
  'discount.create', 'discount.update', 'discount.delete',
  'attendance.clock_in', 'attendance.clock_out',
  'payment.create', 'payment.refund',
  'invoice.create', 'invoice.update', 'invoice.send', 'invoice.mark_paid',
  'prescription.create', 'prescription.update', 'prescription.dispense', 'prescription.cancel',
  'pharmacy_settings.update', 'expiry_report.view',
  'x_reading.view', 'z_reading.generate', 'z_reading.view',
  'cash_drawer.kick', 'audit_log.export',
  'device.create', 'device.update', 'device.delete',
  'subscription.activate',
] as const;

export function extractUserInfo(userId: AuditLog['userId']): { name: string; email: string } | null {
  if (typeof userId === 'object' && userId !== null) {
    return { name: userId.name || '', email: userId.email || '' };
  }
  return null;
}

/** How an action prints on the journal: removals and money going back in stamp red, new records in teal. */
export function actionTone(action: string): 'out' | 'in' | 'plain' {
  const verb = action.split('.').pop() || action;
  if (['delete', 'cancel', 'refund'].includes(verb)) return 'out';
  if (['create', 'activate', 'generate', 'purchase'].includes(verb)) return 'in';
  return 'plain';
}

/** Long ids print as their last 12 characters, the part that tells them apart. */
export function formatEntityId(entityId: string | undefined): string {
  if (!entityId) return '';
  return entityId.length > 20 ? `…${entityId.slice(-12)}` : entityId;
}

/** Whether a details object has anything to print. */
export function hasDetails(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}
