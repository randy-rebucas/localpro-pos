'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FEATURE_MODULE_COUNT } from '@/components/FeaturesGrid';
import { Barcode, LineTag, ReceiptRow } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import { usePublicCopy } from '@/hooks/usePublicCopy';
import { CORE_AUTOMATION_WORKFLOWS, SUPPORTED_UI_LANGUAGES } from '@/lib/marketing-constants';

export default function AboutReading() {
  const { t, shellT } = usePublicCopy('about');

  const rules = [
    [t('rule1', 'Keep selling'), t('rule1Desc', 'When the connection drops, the till keeps working and syncs once it’s back.')],
    [t('rule2', 'Count everything'), t('rule2Desc', 'Every stock movement is recorded, and every cash drawer session ends with a count that shows any shortage or overage.')],
    [t('rule3', 'Keep the books ready'), t('rule3Desc', 'VAT, official receipts and CAS reporting sit in the same system that rings the sale. What you get depends on your plan.')],
    [t('rule4', 'Keep stores separate'), t('rule4Desc', 'Each store’s data stays apart from every other store’s, and changes leave an audit trail.')],
  ];

  return (
    <PublicShell t={shellT}>
      <section aria-labelledby="about-heading" className="bg-brand-navy-deep text-paper-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-28">
          <div className="lg:col-span-7">
            <LineTag no="00" className="text-[#8fe3d0]">
              {t('tag', 'About 1pos')}
            </LineTag>
            <h1 id="about-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
              {t('heading', 'Made for the counter')}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/85">
              {t('intro', '1pos is a BIR-ready point of sale for Philippine stores. It takes the sale, tracks the stock and closes the day in one place.')}
            </p>
          </div>

          <div className="w-full max-w-sm drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)] lg:col-span-5 lg:justify-self-end">
            <div className="mk-tear-b bg-paper-white px-6 pb-9 pt-6 font-receipt text-xs leading-relaxed text-ink">
              <p className="text-center font-semibold uppercase tracking-[0.14em]">{t('readingTitle', 'Z reading')}</p>
              <p className="text-center text-ink/60">{t('readingSubtitle', 'What’s in the box')}</p>
              <div className="mt-4 space-y-1 border-t border-dashed border-ink/40 pt-3">
                <ReceiptRow label={t('readingModules', 'Modules')} value={FEATURE_MODULE_COUNT} />
                <ReceiptRow label={t('readingAutomations', 'Automated workflows')} value={CORE_AUTOMATION_WORKFLOWS} />
                <ReceiptRow label={t('readingLanguages', 'Languages')} value={SUPPORTED_UI_LANGUAGES} />
                <ReceiptRow label={t('readingTypes', 'Business types')} value={t('readingTypesValue', 'Retail, General')} />
              </div>
              <div className="mt-3 border-t-2 border-ink pt-3">
                <ReceiptRow label={t('readingTrial', 'Free trial days')} value="14" strong />
              </div>
              <Barcode className="mx-auto mt-5 h-8 w-40 text-ink" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-maker" className="bg-paper-white py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="relative aspect-[4/3] lg:col-span-7">
            <Image
              src="/images/home/hardware-store.jpg"
              alt={t('photoAlt', 'Hardware store with goods stacked on shelves')}
              fill
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="lg:col-span-5">
            <LineTag no="01">{t('makerTag', 'Who makes it')}</LineTag>
            <h2 id="about-maker" className="mt-4 text-5xl sm:text-6xl">
              {t('makerHeading', 'Stores first')}
            </h2>
            <p className="mt-4 leading-relaxed text-ink/75">
              {t('makerBody', '1pos is a product of Devcom Digital Marketing Services. It’s built for the people behind the counter: owners, managers and cashiers who need the till to work, every day.')}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-rules" className="bg-paper py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-4">
            <LineTag no="02">{t('rulesTag', 'House rules')}</LineTag>
            <h2 id="about-rules" className="mt-4 text-5xl sm:text-6xl">
              {t('rulesHeading', 'How we build it')}
            </h2>
          </div>
          <ol className="border-t-2 border-ink lg:col-span-8">
            {rules.map(([rule, description], i) => (
              <li key={rule} className="flex gap-4 border-b border-ink/20 py-5">
                <span className="w-6 shrink-0 pt-1 font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-semibold">{rule}</h3>
                  <p className="mt-1 leading-relaxed text-ink/75">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="about-cta" className="bg-brand py-14 text-ink">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <h2 id="about-cta" className="text-4xl sm:text-5xl">
            {t('ctaHeading', 'See what it costs')}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/pricing" className="group flex items-center justify-center gap-2 bg-ink px-7 py-4 font-semibold text-paper-white hover:bg-brand-navy">
              {t('ctaPricing', 'View pricing')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <Link href="/contact" className="flex items-center justify-center border-2 border-ink px-7 py-4 font-semibold hover:bg-ink/10">
              {t('ctaContact', 'Contact us')}
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
