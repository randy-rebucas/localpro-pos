import { describe, it, expect } from 'vitest';
import { receiptStoreInfo } from '@/lib/receipt-store-info';

const store = {
  address: { street: '1 Sample St', city: 'Quezon City', state: '', zipCode: '1100' },
  phone: ' 0917 000 0000 ',
  email: 'store@example.com',
  logo: 'https://example.com/logo.png',
  registrationNumber: 'DTI-0000000',
};

describe('receiptStoreInfo', () => {
  it('keeps the old behaviour when no toggle is set: logo, address and phone print, email does not', () => {
    expect(receiptStoreInfo(store)).toEqual({
      address: '1 Sample St, Quezon City, 1100',
      phone: '0917 000 0000',
      email: undefined,
      logo: 'https://example.com/logo.png',
      registrationNumber: 'DTI-0000000',
    });
  });

  it('follows each toggle', () => {
    const info = receiptStoreInfo({
      ...store,
      receiptShowAddress: false,
      receiptShowPhone: false,
      receiptShowEmail: true,
      receiptShowLogo: false,
    });
    expect(info.address).toBeUndefined();
    expect(info.phone).toBeUndefined();
    expect(info.logo).toBeUndefined();
    expect(info.email).toBe('store@example.com');
  });

  it('prints the registration number whatever the toggles say, and drops blank values', () => {
    const info = receiptStoreInfo({ registrationNumber: '  ', phone: '', address: { street: ' ' }, receiptShowEmail: true });
    expect(info).toEqual({ address: undefined, phone: undefined, email: undefined, logo: undefined, registrationNumber: undefined });
    expect(receiptStoreInfo({ registrationNumber: 'SEC-1', receiptShowAddress: false }).registrationNumber).toBe('SEC-1');
  });

  it('returns nothing without settings', () => {
    expect(receiptStoreInfo(null)).toEqual({});
  });
});
