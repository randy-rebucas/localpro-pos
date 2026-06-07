import { describe, expect, it } from 'vitest';
import { isDuplicateReceiptNumberError } from '@/lib/receipt';
import { isDevicePickerCancelled } from '@/lib/hardware/usb-probe';

describe('isDuplicateReceiptNumberError', () => {
  it('detects E11000 on receiptNumber', () => {
    const err = { code: 11000, message: 'E11000 duplicate key error collection: x.transactions index: receiptNumber_1 dup key: { receiptNumber: "REC-20260607-00007" }' };
    expect(isDuplicateReceiptNumberError(err)).toBe(true);
  });

  it('returns false for other duplicate keys', () => {
    const err = { code: 11000, message: 'dup key: { email: "a@b.com" }' };
    expect(isDuplicateReceiptNumberError(err)).toBe(false);
  });
});

describe('isDevicePickerCancelled', () => {
  it('detects NotFoundError from WebUSB picker', () => {
    const err = new DOMException('No device selected.', 'NotFoundError');
    expect(isDevicePickerCancelled(err)).toBe(true);
  });
});
