import { describe, expect, it } from 'vitest';
import { isMongoTransactionUnsupported } from '@/lib/mongo-session';

describe('isMongoTransactionUnsupported', () => {
  it('detects replica set requirement errors', () => {
    const error = new Error(
      'Transaction numbers are only allowed on a replica set member or mongos'
    );
    expect(isMongoTransactionUnsupported(error)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isMongoTransactionUnsupported(new Error('Insufficient stock'))).toBe(false);
  });
});
