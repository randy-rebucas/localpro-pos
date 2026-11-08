import { describe, it, expect } from 'vitest';
import { AuditActions } from '@/lib/audit';
import { AUDIT_ACTION_CODES, actionTone, extractUserInfo, formatEntityId, hasDetails } from '@/lib/audit-helpers';

describe('audit-helpers', () => {
  it('offers every action the server writes, and nothing else', () => {
    expect([...AUDIT_ACTION_CODES].sort()).toEqual([...new Set(Object.values(AuditActions))].sort());
  });

  it('prints removals and refunds in stamp red, new records in teal', () => {
    expect(actionTone('delete')).toBe('out');
    expect(actionTone('transaction.refund')).toBe('out');
    expect(actionTone('prescription.cancel')).toBe('out');
    expect(actionTone('discount.create')).toBe('in');
    expect(actionTone('z_reading.generate')).toBe('in');
    expect(actionTone('login')).toBe('plain');
  });

  it('reads the populated user, or null for a system entry', () => {
    expect(extractUserInfo({ _id: 'u1', name: 'Ana', email: 'ana@example.com' })).toEqual({ name: 'Ana', email: 'ana@example.com' });
    expect(extractUserInfo('u1')).toBeNull();
    expect(extractUserInfo(undefined)).toBeNull();
  });

  it('shortens only long ids', () => {
    expect(formatEntityId(undefined)).toBe('');
    expect(formatEntityId('abc')).toBe('abc');
    expect(formatEntityId('6543210fedcba9876543210f')).toBe('…a9876543210f');
  });

  it('knows when a details object is empty', () => {
    expect(hasDetails(undefined)).toBe(false);
    expect(hasDetails({})).toBe(false);
    expect(hasDetails({ a: 1 })).toBe(true);
  });
});
