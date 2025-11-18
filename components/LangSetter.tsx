'use client';

import { useEffect } from 'react';

interface LangSetterProps {
  lang: 'en' | 'es';
}

export default function LangSetter({ lang }: LangSetterProps) {
  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  return null;
}

