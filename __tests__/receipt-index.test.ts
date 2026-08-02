import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isDuplicateReceiptNumberError } from '@/lib/receipt';
import { isDevicePickerCancelled } from '@/lib/hardware/usb-probe';

function makePrismaUniqueConstraintError(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target },
  });
}

describe('isDuplicateReceiptNumberError', () => {
  it('detects P2002 on receipt_number', () => {
    const err = makePrismaUniqueConstraintError(['tenant_id', 'receipt_number']);
    expect(isDuplicateReceiptNumberError(err)).toBe(true);
  });

  it('returns false for other unique constraint violations', () => {
    const err = makePrismaUniqueConstraintError(['tenant_id', 'email']);
    expect(isDuplicateReceiptNumberError(err)).toBe(false);
  });
});

describe('isDevicePickerCancelled', () => {
  it('detects NotFoundError from WebUSB picker', () => {
    const err = new DOMException('No device selected.', 'NotFoundError');
    expect(isDevicePickerCancelled(err)).toBe(true);
  });
});
