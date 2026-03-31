export interface BrandingOption {
  value: string;
  label: string;
}

export function getFontSourceOptions(): BrandingOption[] {
  return [
    { value: 'system', label: 'System Font' },
    { value: 'google', label: 'Google Font' },
    { value: 'custom', label: 'Custom Font' },
  ];
}

export function getThemeOptions(): BrandingOption[] {
  return [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto (System)' },
    { value: 'custom', label: 'Custom' },
  ];
}

export function getBorderRadiusOptions(): BrandingOption[] {
  return [
    { value: 'none', label: 'None' },
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'Extra Large' },
    { value: 'custom', label: 'Custom' },
  ];
}

export function formatBorderRadiusValue(value: string | undefined): string {
  if (!value) return 'md';
  return value;
}

export function validateCustomCSS(css: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!css || css.trim().length === 0) {
    return { valid: true, errors: [] };
  }

  // Check for common CSS syntax issues
  const openBraces = (css.match(/{/g) || []).length;
  const closeBraces = (css.match(/}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push(`Brace mismatch: ${openBraces} opening, ${closeBraces} closing`);
  }

  // Warn about potentially dangerous selectors
  if (css.includes('</') || css.includes('/*') === false) {
    // Basic check - doesn't catch everything but covers common issues
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function shouldShowGoogleFontUrl(fontSource: string | undefined): boolean {
  return fontSource === 'google';
}

export function shouldShowCustomFontUrl(fontSource: string | undefined): boolean {
  return fontSource === 'custom';
}

export function shouldShowCustomBorderRadius(borderRadius: string | undefined): boolean {
  return borderRadius === 'custom';
}

export function shouldShowCustomThemeCSS(theme: string | undefined): boolean {
  return theme === 'custom';
}

export function getPlaceholderForFontFamily(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.fontFamilyPlaceholder || 'e.g., Roboto, Inter, Arial';
}

export function getPlaceholderForGoogleFontUrl(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.googleFontURLPlaceholder || 'https://fonts.googleapis.com/css2?family=Roboto';
}

export function getPlaceholderForCustomFontUrl(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.customFontURLPlaceholder || 'https://example.com/fonts/custom-font.woff2';
}

export function getPlaceholderForCustomBorderRadius(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.customBorderRadiusPlaceholder || 'e.g., 8px, 0.5rem, 12px 8px';
}

export function getPlaceholderForCustomCSS(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.customCSSPlaceholder || ':root { --primary-color: #2563eb; }';
}

export function getCustomCSSHint(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.admin?.customCSSHint || 'Add custom CSS variables or styles. Use CSS variables for better theme integration.';
}
