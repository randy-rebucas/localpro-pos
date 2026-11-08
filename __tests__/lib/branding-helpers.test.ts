import { describe, it, expect } from 'vitest';
import { cleanFontFamily, findBrandingProblems, isGoogleFontUrl, isHttpsUrl } from '@/lib/branding-helpers';

describe('cleanFontFamily', () => {
  it('strips characters that would break the generated CSS rule', () => {
    expect(cleanFontFamily("Inter'; } body { display:none")).toBe('Inter body display:none');
    expect(cleanFontFamily('  Open   Sans ')).toBe('Open Sans');
  });
});

describe('font URLs', () => {
  it('accepts only https Google Fonts stylesheet links', () => {
    expect(isGoogleFontUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(true);
    expect(isGoogleFontUrl('http://fonts.googleapis.com/css2?family=Inter')).toBe(false);
    expect(isGoogleFontUrl('https://fonts.googleapis.com.evil.example/css')).toBe(false);
    expect(isGoogleFontUrl('not a url')).toBe(false);
  });

  it('requires https for custom font files', () => {
    expect(isHttpsUrl('https://cdn.example.com/font.woff2')).toBe(true);
    expect(isHttpsUrl('http://cdn.example.com/font.woff2')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

describe('findBrandingProblems', () => {
  it('passes the system font with no CSS', () => {
    expect(findBrandingProblems({ fontSource: 'system' })).toEqual([]);
  });

  it('needs a family name and a valid link for Google and custom fonts', () => {
    expect(findBrandingProblems({ fontSource: 'google', googleFontUrl: 'https://example.com/x.css' }))
      .toEqual(['fontFamilyRequired', 'googleUrlInvalid']);
    expect(findBrandingProblems({ fontSource: 'custom', fontFamily: 'Brand', customFontUrl: 'https://cdn.example.com/brand.woff2' }))
      .toEqual([]);
  });

  it('flags unbalanced braces in custom CSS', () => {
    expect(findBrandingProblems({ customTheme: { css: ':root { --x: 1px;' } })).toEqual(['cssBraces']);
  });
});
