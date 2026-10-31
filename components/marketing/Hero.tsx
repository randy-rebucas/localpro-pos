import Link from 'next/link';
import { BadgeCheck } from 'lucide-react';
import { FEATURE_MODULE_COUNT } from './FeaturesGrid';
import TerminalMockup from './TerminalMockup';
import { ArrowIcon } from './ui';
import type { HomeDict } from './useMarketing';
import {
  BUSINESS_TYPE_COUNT,
  CORE_AUTOMATION_WORKFLOWS,
  SUPPORTED_UI_LANGUAGES,
} from '@/lib/marketing-constants';

export default function Hero({ d }: { d: HomeDict }) {
  const specs = [
    { value: FEATURE_MODULE_COUNT, label: d?.heroStatFeatures || 'Features' },
    { value: CORE_AUTOMATION_WORKFLOWS, label: d?.heroStatAutomations || 'Automations' },
    { value: BUSINESS_TYPE_COUNT, label: d?.heroStatBusinessTypes || 'Business Types' },
    { value: SUPPORTED_UI_LANGUAGES, label: d?.heroStatLanguages || 'Languages' },
  ];

  return (
    <div className="relative mk-dark text-white overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/marketing/manila-night.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-45 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/85 to-[#0a1620]/30" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a1620] to-transparent pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14 pb-6 md:pb-8 grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
        {/* Copy */}
        <div className="lg:col-span-5 mk-hero-in">
          <div className="inline-flex items-center gap-1.5 mk-glass rounded-full pl-2 pr-3 py-1 mb-5 text-xs font-medium text-white/85">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.5} aria-hidden="true" />
            {d?.heroBadge || 'BIR-ready · made for Philippine stores'}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-4 text-white">
            {d?.heroTagline || 'Ring it up. Print the OR. Close the drawer.'}
          </h1>

          <p className="text-[15px] text-white/70 leading-relaxed mb-6 max-w-lg">
            {d?.heroDesc ||
              '1pos runs your counter, stockroom, and BIR paperwork from one browser tab — across every branch, and it keeps selling when the internet drops.'}
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <Link href="/signup" className="mk-key-brand mk-sheen group inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-bold text-sm">
              {d?.startFreeTrial || 'Start Free Trial'}
              <ArrowIcon className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/stores" className="mk-key mk-sheen inline-flex items-center justify-center h-11 px-6 rounded-md font-semibold text-sm">
              {d?.browseLiveStores || 'Browse Live Stores'}
            </Link>
          </div>
          <p className="text-white/50 text-xs mb-8">{d?.noCC || 'No credit card required · 14-day free trial · Cancel anytime'}</p>

          {/* Spec readout */}
          <dl className="grid grid-cols-4 gap-1.5 max-w-md">
            {specs.map((s) => (
              <div key={s.label} className="mk-lcd rounded-md px-2 py-2 text-center flex flex-col-reverse">
                <dt className="text-[9px] uppercase tracking-wider mt-1 opacity-75 truncate">{s.label}</dt>
                <dd className="text-xl font-bold leading-none">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Register */}
        <div className="lg:col-span-7 mk-hero-in [animation-delay:150ms]">
          <TerminalMockup />
        </div>
      </div>
    </div>
  );
}
