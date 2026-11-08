import { describe, it, expect } from 'vitest';
import {
  checkRestoreSize,
  collectReferences,
  filterByReferences,
  isReferenceKey,
  MAX_RESTORE_RECORDS,
  MAX_RESTORE_RECORDS_PER_COLLECTION,
  unresolvedReferences,
} from '@/lib/restore-references';

const id = (n: number) => n.toString(16).padStart(24, '0');
const CAT = id(1);
const PROD = id(2);
const SALE = id(3);
const USER = id(4);
const FOREIGN = id(99);

describe('isReferenceKey', () => {
  it('treats *Id, *Ids and known names as references', () => {
    expect(isReferenceKey('categoryId')).toBe(true);
    expect(isReferenceKey('productIds')).toBe(true);
    expect(isReferenceKey('product')).toBe(true);
    expect(isReferenceKey('voidedBy')).toBe(true);
  });

  it('skips the own id, tenantId and outside-system ids', () => {
    expect(isReferenceKey('_id')).toBe(false);
    expect(isReferenceKey('tenantId')).toBe(false);
    expect(isReferenceKey('shopifyCustomerId')).toBe(false);
    expect(isReferenceKey('prescriptionId')).toBe(false);
    expect(isReferenceKey('name')).toBe(false);
  });
});

describe('collectReferences', () => {
  it('finds top-level, array and nested references', () => {
    const sale = {
      _id: SALE,
      tenantId: FOREIGN,
      userId: USER,
      items: [{ product: PROD, name: 'Mug' }],
      branchStock: [{ branchId: id(5) }],
    };
    expect(collectReferences(sale).sort()).toEqual([PROD, USER, id(5)].sort());
  });

  it('reads id arrays and ignores values that are not object ids', () => {
    const rule = { categoryIds: [CAT, 'nope'], productIds: [], deviceId: 'TERM-01', customerId: null };
    expect(collectReferences(rule)).toEqual([CAT]);
  });

  it('ignores the payment provider ids inside paymentDetails', () => {
    const payment = { transactionId: SALE, paymentDetails: { transactionId: FOREIGN } };
    expect(collectReferences(payment)).toEqual([SALE]);
  });

  it('matches ids regardless of case', () => {
    expect(collectReferences({ userId: 'ABCDEF0123456789ABCDEF01' })).toEqual(['abcdef0123456789abcdef01']);
  });
});

describe('unresolvedReferences', () => {
  it('lists only ids that are not records in the file', () => {
    const file = {
      categories: [{ _id: CAT }],
      products: [{ _id: PROD, categoryId: CAT, branchId: id(5) }],
    };
    expect(unresolvedReferences(file)).toEqual([id(5)]);
  });
});

describe('filterByReferences', () => {
  it('keeps records whose references are in the file or already in the store', () => {
    const file = {
      categories: [{ _id: CAT }],
      products: [{ _id: PROD, categoryId: CAT }],
      transactions: [{ _id: SALE, userId: USER, items: [{ product: PROD }] }],
    };
    const { kept, badReference } = filterByReferences(file, [USER]);
    expect(kept.transactions).toHaveLength(1);
    expect(badReference).toEqual({ categories: 0, products: 0, transactions: 0 });
  });

  it('skips a record that points at an id from outside this store', () => {
    const file = {
      products: [{ _id: PROD, categoryId: FOREIGN }, { _id: id(6) }],
    };
    const { kept, badReference } = filterByReferences(file, []);
    expect(kept.products).toEqual([{ _id: id(6) }]);
    expect(badReference.products).toBe(1);
  });

  it('also skips records that pointed at a skipped record', () => {
    const file = {
      products: [{ _id: PROD, categoryId: FOREIGN }],
      transactions: [{ _id: SALE, items: [{ product: PROD }] }],
      payments: [{ _id: id(7), transactionId: SALE }],
    };
    const { kept, badReference } = filterByReferences(file, []);
    expect(kept.products).toHaveLength(0);
    expect(kept.transactions).toHaveLength(0);
    expect(kept.payments).toHaveLength(0);
    expect(badReference).toEqual({ products: 1, transactions: 1, payments: 1 });
  });

  it('does not drop anything when there are no references', () => {
    const file = { discounts: [{ _id: id(8), code: 'TEN' }, { code: 'NOID' }] };
    expect(filterByReferences(file, []).kept.discounts).toHaveLength(2);
  });
});

describe('checkRestoreSize', () => {
  const many = (n: number) => Array.from({ length: n }, () => ({}));

  it('accepts files within the limits', () => {
    expect(checkRestoreSize({ products: many(10) })).toBeNull();
  });

  it('rejects one collection over the per-collection limit', () => {
    expect(checkRestoreSize({ products: many(MAX_RESTORE_RECORDS_PER_COLLECTION + 1) }))
      .toEqual({ code: 'too_many_records', collection: 'products' });
  });

  it('rejects files over the total limit', () => {
    const half = Math.floor(MAX_RESTORE_RECORDS / 3) + 1;
    expect(checkRestoreSize({ a: many(half), b: many(half), c: many(half) })).toEqual({ code: 'too_many_records' });
  });
});
