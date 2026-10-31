'use client';

import type { ReactNode } from 'react';
import SiteNav from './SiteNav';
import SiteFooter from './SiteFooter';
import { useHomeDict } from './useMarketing';

/** Header + footer for public pages other than the homepage. Children render their own `<main>`. */
export default function MarketingShell({ children }: { children: ReactNode }) {
  const d = useHomeDict();

  return (
    <div className="mk-root min-h-screen bg-[#0a1620] overflow-x-hidden">
      <SiteNav d={d} />
      {children}
      <SiteFooter d={d} />
    </div>
  );
}
