'use client';

import { useEffect, useState } from 'react';
import { usePublicCopy } from '@/hooks/usePublicCopy';
import Hero from '@/components/marketing/Hero';
import {
  CompanionApp,
  DayAtTheCounter,
  Ecommerce,
  FinalReceipt,
  Modules,
  ParallaxBand,
  Solutions,
  Testimonials,
  ZReading,
  type PlatformStats,
} from '@/components/marketing/HomeSections';
import PublicShell from '@/components/marketing/PublicShell';
import Steps from '@/components/marketing/Steps';

export default function MarketingPageClient() {
  const { t } = usePublicCopy('home');
  const [platformStats, setPlatformStats] = useState<PlatformStats>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/platform-stats');
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !json?.data) {
          setPlatformStats('failed');
          return;
        }
        setPlatformStats({
          activeTenants: Number(json.data.activeTenants) || 0,
          completedTransactions: Number(json.data.completedTransactions) || 0,
        });
      } catch {
        if (!cancelled) setPlatformStats('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicShell t={t}>
      <Hero t={t} />
      <ZReading t={t} stats={platformStats} />
      <Steps t={t} />
      <ParallaxBand t={t} />
      <DayAtTheCounter t={t} />
      <Modules t={t} />
      <Solutions t={t} />
      <Ecommerce t={t} />
      <Testimonials t={t} />
      <CompanionApp t={t} />
      <FinalReceipt t={t} />
    </PublicShell>
  );
}
