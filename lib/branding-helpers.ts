export type FontSource = 'system' | 'google' | 'custom';

export const FONT_SOURCES: FontSource[] = ['system', 'google', 'custom'];

/**
 * The font family is written into a CSS string (`font-family: '<name>'`) by the tenant
 * settings context, so quotes, semicolons, braces and backslashes would break the rule.
 */
export function cleanFontFamily(name: string): string {
  return name.replace(/["'`;{}\\<>]/g, '').replace(/\s+/g, ' ').trim();
}

export type BrandingProblem =
  | 'fontFamilyRequired'
  | 'googleUrlInvalid'
  | 'customUrlInvalid'
  | 'cssBraces';

/** Problems that would stop the chosen font or CSS from working once saved. */
export function findBrandingProblems(branding: {
  fontSource?: string;
  fontFamily?: string;
  googleFontUrl?: string;
  customFontUrl?: string;
  customTheme?: { css?: string };
}): BrandingProblem[] {
  const problems: BrandingProblem[] = [];
  const source = branding.fontSource || 'system';
  const family = cleanFontFamily(branding.fontFamily || '');

  if (source !== 'system' && !family) problems.push('fontFamilyRequired');
  if (source === 'google' && !isGoogleFontUrl(branding.googleFontUrl)) problems.push('googleUrlInvalid');
  if (source === 'custom' && !isHttpsUrl(branding.customFontUrl)) problems.push('customUrlInvalid');

  const css = branding.customTheme?.css || '';
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  if (open !== close) problems.push('cssBraces');

  return problems;
}

export function isHttpsUrl(value?: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A Google Fonts stylesheet link, e.g. https://fonts.googleapis.com/css2?family=Inter */
export function isGoogleFontUrl(value?: string): boolean {
  if (!isHttpsUrl(value)) return false;
  return new URL(value!).hostname === 'fonts.googleapis.com';
}

/**
 * A font URL ready to go inside CSS `url(...)`: the parsed https URL, as a
 * double-quoted CSS string. URL serialisation percent-encodes `"`, spaces and
 * line breaks, so nothing in it can close the string or the rule. Null when
 * the value is not an https URL.
 */
export function cssFontUrl(value?: string): string | null {
  if (!isHttpsUrl(value)) return null;
  return JSON.stringify(new URL(value!).href);
}
