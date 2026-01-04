'use client';

// Dictionary type - using Record for nested structure
type Dictionary = Record<string, Record<string, string | Record<string, string>>>;
type DictionaryLoader = () => Promise<Dictionary>;

const dictionaries: Record<'en' | 'es', DictionaryLoader> = {
  en: async () => {
    try {
      const dictModule = await import('./dictionaries/en.json');
      // JSON imports in Next.js can be the default export or the module itself
      return dictModule.default || dictModule;
    } catch (error) {
      console.error('Error loading English dictionary:', error);
      throw error;
    }
  },
  es: async () => {
    try {
      const dictModule = await import('./dictionaries/es.json');
      // JSON imports in Next.js can be the default export or the module itself
      return dictModule.default || dictModule;
    } catch (error) {
      console.error('Error loading Spanish dictionary:', error);
      // Fallback to English if Spanish fails
      const dictModule = await import('./dictionaries/en.json');
      return dictModule.default || dictModule;
    }
  },
};

export const getDictionaryClient = async (locale: 'en' | 'es'): Promise<Dictionary> => {
  // Validate locale
  if (locale !== 'en' && locale !== 'es') {
    console.warn(`Invalid locale "${locale}", falling back to English`);
    locale = 'en';
  }
  
  const loader = dictionaries[locale];
  
  if (!loader) {
    console.error(`Dictionary loader for locale "${locale}" not found`);
    // Fallback to English
    return dictionaries.en();
  }
  
  if (typeof loader !== 'function') {
    console.error(`Dictionary loader for locale "${locale}" is not a function, got:`, typeof loader);
    // Fallback to English
    return dictionaries.en();
  }
  
  try {
    return await loader();
  } catch (error) {
    console.error(`Error loading dictionary for locale "${locale}":`, error);
    // Fallback to English
    return dictionaries.en();
  }
};

