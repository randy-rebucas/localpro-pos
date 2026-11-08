import { describe, it, expect } from 'vitest';
import { escapeHtml, findUnsafeTemplateMarkup, sanitizeReceiptHtml } from '@/lib/receipt-template-sanitize';
import { DEFAULT_RECEIPT_TEMPLATE, renderReceiptTemplate, validateTemplate, type ReceiptData } from '@/lib/receipt-templates';

const baseData = {
  receiptNumber: 'R-1',
  date: '2026-11-08',
  total: 100,
  subtotal: 100,
  items: [],
} as unknown as ReceiptData;

describe('sanitizeReceiptHtml', () => {
  it('removes scripts, event handlers and javascript: URLs', () => {
    const out = sanitizeReceiptHtml(
      '<div><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">x</a></div>'
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/javascript:/i);
  });

  it('removes forms and frames', () => {
    const out = sanitizeReceiptHtml('<form action="https://evil"><input name="p"></form><iframe src="https://evil"></iframe>');
    expect(out).not.toMatch(/<form|<input|<iframe/i);
  });

  it('keeps receipt layout: <style>, tables, images and inline styles', () => {
    const out = sanitizeReceiptHtml(
      '<html><head><style>.c{text-align:center}</style></head><body><table><tr><td style="font-weight:bold">A</td></tr></table><img src="https://cdn.example.com/logo.png" alt="Logo"></body></html>'
    );
    expect(out).toContain('<style>.c{text-align:center}</style>');
    expect(out).toContain('<td style="font-weight:bold">A</td>');
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
  });
});

describe('renderReceiptTemplate', () => {
  it('escapes substituted values so names render as text', () => {
    const html = renderReceiptTemplate(
      '<div>{{customerName}}</div>{{receiptNumber}}{{date}}{{total}}',
      { ...baseData, customerName: '<img src=x onerror=alert(1)>' } as ReceiptData
    );
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes values inside {{#each}} blocks', () => {
    const html = renderReceiptTemplate(
      '{{#each items}}<p>{{name}}</p>{{/each}}',
      { ...baseData, items: [{ name: '<script>alert(1)</script>', quantity: 1, price: 1, subtotal: 1 }] } as unknown as ReceiptData
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not re-substitute placeholders found inside values', () => {
    const html = renderReceiptTemplate(
      '<p>{{customerName}}</p>{{receiptNumber}}{{date}}',
      { ...baseData, customerName: '{{total}}' } as ReceiptData
    );
    expect(html).not.toContain('<p>100</p>');
  });

  it('strips handlers authored into the template itself', () => {
    const html = renderReceiptTemplate('<img src="x" onerror="alert(1)">{{receiptNumber}}', baseData);
    expect(html).not.toMatch(/onerror/i);
  });

  it('still renders the default template', () => {
    const html = renderReceiptTemplate(DEFAULT_RECEIPT_TEMPLATE.html, baseData);
    expect(html).toContain('R-1');
    expect(html).toMatch(/<style>/);
  });
});

describe('validateTemplate', () => {
  const valid = '{{receiptNumber}} {{date}} {{total}}';

  it('accepts the default template', () => {
    expect(validateTemplate(DEFAULT_RECEIPT_TEMPLATE.html).valid).toBe(true);
  });

  it('still accepts templates copied from the old default (logo onerror fallback)', () => {
    expect(validateTemplate(`${valid}<img src="{{logo}}" onerror="this.remove()" />`).valid).toBe(true);
  });

  it.each([
    ['<img src=x onerror="this.remove();alert(1)">'],
    ['<script>alert(1)</script>'],
    ['<img src=x onerror="alert(1)">'],
    ['<a href="javascript:alert(1)">x</a>'],
    ['<iframe src="https://evil"></iframe>'],
  ])('rejects unsafe markup: %s', (snippet) => {
    expect(validateTemplate(`${valid}${snippet}`).valid).toBe(false);
  });
});

describe('helpers', () => {
  it('escapeHtml escapes quotes for attribute contexts', () => {
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });

  it('findUnsafeTemplateMarkup passes plain markup', () => {
    expect(findUnsafeTemplateMarkup('<div class="online">x</div>')).toBeNull();
  });
});
