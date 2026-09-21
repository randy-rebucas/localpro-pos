import Holidays from 'date-holidays';

export interface CountryOption {
  code: string;
  name: string;
}

export interface HolidaySuggestion {
  name: string;
  date: string; // YYYY-MM-DD
  type: 'public' | 'bank';
}

// Short forms / common aliases that don't literally match the library's
// English country names (e.g. tenant typed "USA" but the library calls it
// "United States of America").
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  us: 'US',
  'united states': 'US',
  uk: 'GB',
  england: 'GB',
  'great britain': 'GB',
  'south korea': 'KR',
  'korea, republic of': 'KR',
  uae: 'AE',
  vietnam: 'VN',
  'viet nam': 'VN',
  taiwan: 'TW',
  'hong kong': 'HK',
  russia: 'RU',
  'czech republic': 'CZ',
  czechia: 'CZ',
};

let cachedCountries: CountryOption[] | null = null;

export function getCountryOptions(): CountryOption[] {
  if (cachedCountries) return cachedCountries;
  const hd = new Holidays();
  const countries = hd.getCountries('en') as Record<string, string>;
  cachedCountries = Object.entries(countries)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
}

/**
 * Best-effort match of a tenant's free-text address country (e.g.
 * TenantSettings.addressCountry, which admins type manually — see
 * app/[tenant]/[lang]/admin/settings/page.tsx) against an ISO country code
 * the holidays library understands. Returns null if nothing reasonably
 * matches, so the caller can fall back to an explicit country picker
 * instead of silently guessing wrong.
 */
export function resolveCountryCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const needle = input.trim().toLowerCase();
  if (!needle) return null;

  const options = getCountryOptions();

  // Exact code match (tenant may have stored "PH" directly).
  const byCode = options.find((c) => c.code.toLowerCase() === needle);
  if (byCode) return byCode.code;

  // Exact name match.
  const byName = options.find((c) => c.name.toLowerCase() === needle);
  if (byName) return byName.code;

  // Known alias.
  if (COUNTRY_ALIASES[needle]) return COUNTRY_ALIASES[needle];

  // Substring match in either direction (e.g. "Republic of the Philippines"
  // contains "Philippines"; "United States" is contained in the library's
  // "United States of America").
  const bySubstring = options.find(
    (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
  );
  if (bySubstring) return bySubstring.code;

  return null;
}

export function isValidCountryCode(code: string): boolean {
  return getCountryOptions().some((c) => c.code === code.toUpperCase());
}

/**
 * Public/bank holidays for a country + year, in the shape the Holiday
 * Calendar admin UI and TenantHoliday.create both expect. Deliberately
 * excludes 'observance'/'optional'/'school' entries the library also
 * returns — those aren't days a business would typically close for, and
 * including them would flood the suggestion list.
 */
export function getPublicHolidaySuggestions(countryCode: string, year: number): HolidaySuggestion[] {
  const hd = new Holidays(countryCode.toUpperCase());
  const holidays = hd.getHolidays(year) || [];

  return holidays
    .filter((h) => h.type === 'public' || h.type === 'bank')
    .map((h) => ({
      name: h.name,
      date: h.date.slice(0, 10), // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DD"
      type: h.type as 'public' | 'bank',
    }));
}
