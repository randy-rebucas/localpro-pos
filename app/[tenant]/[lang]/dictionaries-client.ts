'use client';

const dictionaries = {
  en: () => import('./dictionaries/en.json').then((module) => module.default),
  es: () => import('./dictionaries/es.json').then((module) => module.default),
};

export const getDictionaryClient = async (locale: 'en' | 'es') => {
  return dictionaries[locale]();
};

