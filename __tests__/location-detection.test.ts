import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocation } from '@/lib/location-detection';
import { getDefaultTenantSettings } from '@/lib/currency';

function stubBrowser(language: string, timeZone: string) {
  vi.stubGlobal('navigator', { language, languages: [language] });
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone } as Intl.ResolvedDateTimeFormatOptions);
}

describe('detectLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats a Philippine timezone as the Philippines even with an en-US browser', async () => {
    stubBrowser('en-US', 'Asia/Manila');
    const detected = await detectLocation();
    expect(detected.currency).toBe('PHP');
    expect(detected.country).toBe('PH');
  });

  it('keeps USD for a browser that really is in the US', async () => {
    stubBrowser('en-US', 'America/New_York');
    expect((await detectLocation()).currency).toBe('USD');
  });

  it('uses the browser region elsewhere', async () => {
    stubBrowser('en-GB', 'Europe/London');
    expect((await detectLocation()).currency).toBe('GBP');
  });

  it('falls back to PHP when the region is unknown', async () => {
    stubBrowser('en', 'Etc/UTC');
    expect((await detectLocation()).currency).toBe('PHP');
  });
});

describe('getDefaultTenantSettings', () => {
  it('defaults new tenants to PHP', () => {
    expect(getDefaultTenantSettings().currency).toBe('PHP');
  });
});
