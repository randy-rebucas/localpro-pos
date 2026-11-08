import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { formatEmailTemplate, parseEmailTemplate } from '@/lib/notification-template-format';
import { escapeHtml } from '@/lib/html-escape';
import { publicEcommerceError } from '@/lib/ecommerce/public-error';

describe('email template format', () => {
  it('keeps a body that contains pipes intact', () => {
    const stored = formatEmailTemplate('Your booking', 'Call us | Visit us | Email us');
    expect(parseEmailTemplate(stored)).toEqual({ subject: 'Your booking', body: 'Call us | Visit us | Email us' });
  });

  it('round-trips a subjectless body that contains a pipe', () => {
    const stored = formatEmailTemplate('', 'A | B');
    expect(stored).toBe('|A | B');
    expect(parseEmailTemplate(stored)).toEqual({ subject: null, body: 'A | B' });
  });

  it('stores a plain subjectless body unchanged (legacy format)', () => {
    expect(formatEmailTemplate(undefined, 'Hello')).toBe('Hello');
    expect(parseEmailTemplate('Hello')).toEqual({ subject: null, body: 'Hello' });
  });

  it('reads legacy "subject|body" values', () => {
    expect(parseEmailTemplate('Hi {{customerName}}|Body text')).toEqual({ subject: 'Hi {{customerName}}', body: 'Body text' });
  });

  it('handles empty values', () => {
    expect(parseEmailTemplate(undefined)).toEqual({ subject: null, body: '' });
  });
});

describe('escapeHtml', () => {
  it('escapes markup, quotes and template braces', () => {
    expect(escapeHtml('<b a="1">{{x}}</b>')).toBe('&lt;b a=&quot;1&quot;&gt;&#123;&#123;x&#125;&#125;&lt;/b&gt;');
  });
});

describe('publicEcommerceError', () => {
  it('passes through client errors and store API errors', () => {
    expect(publicEcommerceError('Forbidden: Insufficient permissions', 403, 'x')).toBe('Forbidden: Insufficient permissions');
    expect(publicEcommerceError('WooCommerce API 401: invalid key', 500, 'x')).toBe('WooCommerce API 401: invalid key');
  });

  it('hides internal errors', () => {
    expect(publicEcommerceError('E11000 duplicate key error collection: tenants', 500, 'Sync failed')).toBe('Sync failed');
  });
});
