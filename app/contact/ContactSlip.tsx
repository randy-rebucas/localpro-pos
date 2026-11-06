'use client';

import Link from 'next/link';
import { ArrowRight, Mail } from 'lucide-react';
import { Barcode, LineTag } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import { usePublicCopy } from '@/hooks/usePublicCopy';

const SUPPORT_EMAIL = 'support@devcomdigital.com';

export default function ContactSlip() {
  const { t, shellT } = usePublicCopy('contact');

  const topics = [
    [t('topicPlans', 'Plans and quotes'), t('subjectPlans', '1pos plans and quotes')],
    [t('topicSupport', 'Help with my store'), t('subjectSupport', '1pos support request')],
    [t('topicBilling', 'Billing'), t('subjectBilling', '1pos billing question')],
    [t('topicPrivacy', 'My data and privacy'), t('subjectPrivacy', '1pos privacy request')],
  ];

  const checklist = [
    [t('include1', 'Your store link'), t('include1Desc', 'The name after 1pos in your address, so we find the right store.')],
    [t('include2', 'What happened'), t('include2Desc', 'What you were doing, what you expected, and what you got instead.')],
    [t('include3', 'A screenshot'), t('include3Desc', 'If there’s an error on screen, a photo of it helps. Leave out passwords and customer details.')],
  ];

  return (
    <PublicShell t={shellT}>
      <section aria-labelledby="contact-heading" className="bg-brand-navy-deep text-paper-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-28">
          <div className="lg:col-span-7">
            <LineTag no="00" className="text-[#8fe3d0]">
              {t('tag', 'Contact')}
            </LineTag>
            <h1 id="contact-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
              {t('heading', 'Ask at the counter')}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/85">{t('intro', 'Pick what it’s about and your email app opens with the subject filled in.')}</p>
          </div>

          <div className="w-full max-w-md drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)] lg:col-span-5 lg:justify-self-end">
            <div className="mk-tear-b bg-paper-white px-6 pb-9 pt-6 text-ink">
              <p className="text-center font-receipt text-xs font-semibold uppercase tracking-[0.14em]">{t('slipTitle', 'Customer copy')}</p>
              <ul className="mt-4 border-t border-dashed border-ink/40">
                {topics.map(([topic, subject], i) => (
                  <li key={topic} className="border-b border-dashed border-ink/40">
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`} className="group flex items-center gap-3 py-2 font-semibold">
                      <span className="font-receipt text-xs font-normal text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                      {topic}
                      <span className="mk-leader" aria-hidden="true" />
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 flex items-center justify-center gap-2 break-all font-receipt text-sm underline underline-offset-2">
                <Mail className="h-4 w-4 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-3 text-center font-receipt text-xs text-ink/65">{t('maker', '1pos is a product of Devcom Digital Marketing Services.')}</p>
              <Barcode className="mx-auto mt-5 h-8 w-40 text-ink" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="contact-include" className="bg-paper py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-4">
            <LineTag no="01">{t('includeTag', 'For a faster fix')}</LineTag>
            <h2 id="contact-include" className="mt-4 text-5xl sm:text-6xl">
              {t('includeHeading', 'Tell us three things')}
            </h2>
          </div>
          <ol className="border-t-2 border-ink lg:col-span-8">
            {checklist.map(([item, description], i) => (
              <li key={item} className="flex gap-4 border-b border-ink/20 py-5">
                <span className="w-6 shrink-0 pt-1 font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-semibold">{item}</h3>
                  <p className="mt-1 leading-relaxed text-ink/75">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="contact-cta" className="bg-brand py-14 text-ink">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <h2 id="contact-cta" className="text-4xl sm:text-5xl">
              {t('ctaHeading', 'Trying to sign in?')}
            </h2>
            <p className="mt-2">{t('ctaDesc', 'Find your store and log in from there.')}</p>
          </div>
          <Link href="/stores" className="group flex shrink-0 items-center justify-center gap-2 bg-ink px-7 py-4 font-semibold text-paper-white hover:bg-brand-navy">
            {t('ctaStores', 'Find your store')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
