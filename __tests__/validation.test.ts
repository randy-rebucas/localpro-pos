import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  validateProduct,
  validateTransaction,
  validateTenant,
  validateCategory,
  sanitizeString,
  validateAndSanitize,
  ValidationException,
} from '@/lib/validation';

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------
describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('u+tag@sub.domain.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('no-at-sign')).toBe(false);
    expect(validateEmail('@no-local.com')).toBe(false);
    expect(validateEmail('spaces in@email.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------
describe('validatePassword', () => {
  it('accepts a strong password', () => {
    const result = validatePassword('Str0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects short passwords', () => {
    const result = validatePassword('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('8 characters'))).toBe(true);
  });

  it('rejects passwords exceeding max length', () => {
    const long = 'A1!' + 'a'.repeat(126);
    const result = validatePassword(long);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('128'))).toBe(true);
  });

  it('requires uppercase', () => {
    const result = validatePassword('nouppercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
  });

  it('requires lowercase', () => {
    const result = validatePassword('NOLOWERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
  });

  it('requires a number', () => {
    const result = validatePassword('NoNumber!!aa');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('number'))).toBe(true);
  });

  it('requires a special character', () => {
    const result = validatePassword('NoSpecial1aa');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('special'))).toBe(true);
  });

  it('uses custom translation function', () => {
    const t = (key: string, fallback: string) => `[${key}]`;
    const result = validatePassword('short', t);
    expect(result.errors[0]).toMatch(/^\[/);
  });
});

// ---------------------------------------------------------------------------
// validateProduct
// ---------------------------------------------------------------------------
describe('validateProduct', () => {
  it('passes for valid product data', () => {
    const errors = validateProduct({ name: 'Widget', price: 9.99, stock: 10 });
    expect(errors).toHaveLength(0);
  });

  it('requires name', () => {
    const errors = validateProduct({ price: 1, stock: 0 });
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('rejects name > 200 chars', () => {
    const errors = validateProduct({ name: 'x'.repeat(201), price: 1, stock: 0 });
    expect(errors.some(e => e.field === 'name' && e.message.includes('200'))).toBe(true);
  });

  it('requires price', () => {
    const errors = validateProduct({ name: 'Widget', stock: 0 });
    expect(errors.some(e => e.field === 'price')).toBe(true);
  });

  it('rejects negative price', () => {
    const errors = validateProduct({ name: 'Widget', price: -1, stock: 0 });
    expect(errors.some(e => e.field === 'price')).toBe(true);
  });

  it('requires stock', () => {
    const errors = validateProduct({ name: 'Widget', price: 1 });
    expect(errors.some(e => e.field === 'stock')).toBe(true);
  });

  it('rejects negative stock', () => {
    const errors = validateProduct({ name: 'Widget', price: 1, stock: -1 });
    expect(errors.some(e => e.field === 'stock')).toBe(true);
  });

  it('rejects non-integer stock', () => {
    const errors = validateProduct({ name: 'Widget', price: 1, stock: 1.5 });
    expect(errors.some(e => e.field === 'stock')).toBe(true);
  });

  it('rejects sku > 50 chars', () => {
    const errors = validateProduct({ name: 'Widget', price: 1, stock: 0, sku: 'x'.repeat(51) });
    expect(errors.some(e => e.field === 'sku')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTransaction
// ---------------------------------------------------------------------------
describe('validateTransaction', () => {
  it('passes for valid transaction', () => {
    const errors = validateTransaction({
      items: [{ productId: 'abc', quantity: 2 }],
      paymentMethod: 'card',
    });
    expect(errors).toHaveLength(0);
  });

  it('requires items', () => {
    const errors = validateTransaction({ items: [], paymentMethod: 'card' });
    expect(errors.some(e => e.field === 'items')).toBe(true);
  });

  it('requires productId on items', () => {
    const errors = validateTransaction({
      items: [{ quantity: 1 }],
      paymentMethod: 'card',
    });
    expect(errors.some(e => e.field.includes('productId'))).toBe(true);
  });

  it('rejects zero quantity', () => {
    const errors = validateTransaction({
      items: [{ productId: 'abc', quantity: 0 }],
      paymentMethod: 'card',
    });
    expect(errors.some(e => e.field.includes('quantity'))).toBe(true);
  });

  it('rejects invalid payment method', () => {
    const errors = validateTransaction({
      items: [{ productId: 'abc', quantity: 1 }],
      paymentMethod: 'bitcoin',
    });
    expect(errors.some(e => e.field === 'paymentMethod')).toBe(true);
  });

  it('requires cashReceived for cash payments', () => {
    const errors = validateTransaction({
      items: [{ productId: 'abc', quantity: 1 }],
      paymentMethod: 'cash',
    });
    expect(errors.some(e => e.field === 'cashReceived')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTenant
// ---------------------------------------------------------------------------
describe('validateTenant', () => {
  it('passes for valid tenant', () => {
    const errors = validateTenant({ slug: 'my-store', name: 'My Store' });
    expect(errors).toHaveLength(0);
  });

  it('requires slug', () => {
    const errors = validateTenant({ name: 'My Store' });
    expect(errors.some(e => e.field === 'slug')).toBe(true);
  });

  it('rejects slug with uppercase', () => {
    const errors = validateTenant({ slug: 'MyStore', name: 'My Store' });
    expect(errors.some(e => e.field === 'slug')).toBe(true);
  });

  it('rejects slug with spaces', () => {
    const errors = validateTenant({ slug: 'my store', name: 'My Store' });
    expect(errors.some(e => e.field === 'slug')).toBe(true);
  });

  it('requires name', () => {
    const errors = validateTenant({ slug: 'my-store' });
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCategory
// ---------------------------------------------------------------------------
describe('validateCategory', () => {
  it('passes for valid category', () => {
    const errors = validateCategory({ name: 'Electronics' });
    expect(errors).toHaveLength(0);
  });

  it('requires name', () => {
    const errors = validateCategory({});
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('rejects name > 200 chars', () => {
    const errors = validateCategory({ name: 'x'.repeat(201) });
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('rejects description > 1000 chars', () => {
    const errors = validateCategory({ name: 'Valid', description: 'x'.repeat(1001) });
    expect(errors.some(e => e.field === 'description')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------
describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('strips angle brackets (XSS)', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('strips javascript: protocol', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  it('strips inline event handlers', () => {
    // sanitizeString removes the event handler attribute (onload=) but keeps trailing text
    expect(sanitizeString('onload=doStuff()')).toBe('doStuff()');
    expect(sanitizeString('onclick = alert(1)')).not.toContain('onclick');
  });

  it('encodes bare ampersands but preserves entities', () => {
    expect(sanitizeString('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(sanitizeString('&amp;')).toBe('&amp;');
    expect(sanitizeString('&lt;')).toBe('&lt;');
  });
});

// ---------------------------------------------------------------------------
// validateAndSanitize
// ---------------------------------------------------------------------------
describe('validateAndSanitize', () => {
  it('sanitizes string fields in data', () => {
    const { data } = validateAndSanitize(
      { name: '  <b>Bold</b>  ', price: 10, stock: 1 },
      validateProduct
    );
    expect(data.name).toBe('bBold/b');
  });

  it('returns validation errors alongside sanitized data', () => {
    const { errors } = validateAndSanitize(
      { name: '', price: -1, stock: -1 },
      validateProduct
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ValidationException
// ---------------------------------------------------------------------------
describe('ValidationException', () => {
  it('carries errors array', () => {
    const err = new ValidationException([{ field: 'x', message: 'bad' }]);
    expect(err.name).toBe('ValidationException');
    expect(err.errors).toHaveLength(1);
    expect(err.message).toBe('Validation failed');
  });
});
