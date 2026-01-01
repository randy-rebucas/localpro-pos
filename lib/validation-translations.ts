/**
 * Helper functions for translating validation errors in API routes
 */

import { getDictionary } from '@/app/[tenant]/[lang]/dictionaries';
import { getTenantBySlug } from '@/lib/tenant';

export type TranslationFunction = (key: string, fallback: string) => string;

/**
 * Get translation function for API routes based on language
 * @param lang - Language code ('en' or 'es')
 * @returns Translation function
 */
export async function getValidationTranslator(lang: 'en' | 'es' = 'en'): Promise<TranslationFunction> {
  try {
    const dict = await getDictionary(lang);
    return (key: string, fallback: string) => {
      // Support nested keys like 'validation.passwordMinLength'
      const keys = key.split('.');
      let value: any = dict;
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
      return value || fallback;
    };
  } catch (error) {
    // If dictionary fails to load, return fallback function
    return (key: string, fallback: string) => fallback;
  }
}

/**
 * Get translation function from tenant slug
 * @param tenantSlug - Tenant slug
 * @returns Translation function
 */
export async function getValidationTranslatorFromTenant(tenantSlug: string): Promise<TranslationFunction> {
  try {
    const tenant = await getTenantBySlug(tenantSlug);
    const lang = (tenant?.settings?.language || 'en') as 'en' | 'es';
    return await getValidationTranslator(lang);
  } catch (error) {
    return await getValidationTranslator('en');
  }
}

/**
 * Get translation function from request (extracts language from headers or tenant)
 * @param request - NextRequest object
 * @returns Translation function
 */
export async function getValidationTranslatorFromRequest(request: Request): Promise<TranslationFunction> {
  try {
    // Try to get language from Accept-Language header
    const acceptLanguage = request.headers.get('accept-language');
    let lang: 'en' | 'es' = 'en';
    
    if (acceptLanguage) {
      if (acceptLanguage.includes('es')) {
        lang = 'es';
      }
    }
    
    // Try to get from URL path if available
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      const possibleLang = pathParts[1];
      if (possibleLang === 'es' || possibleLang === 'en') {
        lang = possibleLang as 'en' | 'es';
      }
    }
    
    return await getValidationTranslator(lang);
  } catch (error) {
    return await getValidationTranslator('en');
  }
}
