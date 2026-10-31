import Link from 'next/link';
import { Camera, ScanLine } from 'lucide-react';
import { ArrowIcon, FKey } from './ui';
import type { HomeDict } from './useMarketing';

/** Final call-to-action band, with the companion app alongside. */
export default function ClosingCta({ d }: { d: HomeDict }) {
  return (
    <section className="relative mk-dark text-white px-4 sm:px-6 py-12 md:py-16 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/marketing/convenience-night.webp" alt="" loading="lazy" className="mk-parallax opacity-40 object-[center_30%] absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/80 to-[#0a1620]/50" />
      </div>
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-5 gap-4">
        {/* Trial CTA */}
        <div aria-labelledby="cta-heading" role="region" className="mk-reveal lg:col-span-3 mk-glass backdrop-blur-md rounded-xl p-6 md:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FKey dark>↵ ENTER</FKey>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.ctaBadge || 'OPEN A TILL'}</span>
            </div>
            <h2 id="cta-heading" className="text-3xl md:text-4xl font-black tracking-tight mb-3">
              {d?.ctaHeading || 'Open your first till today.'}
            </h2>
            <p className="text-sm md:text-[15px] text-white/65 leading-relaxed max-w-xl mb-6">
              {d?.ctaDesc || 'Add your products, print a test receipt, ring up a real sale. Free for 14 days — no card needed.'}
            </p>
          </div>
          <div>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <Link href="/signup" className="mk-key-brand mk-sheen inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md font-bold text-sm">
                {d?.ctaStartTrial || 'Start Your Free 14-Day Trial'}
                <ArrowIcon className="w-4 h-4" />
              </Link>
              <Link href="/stores" className="mk-key mk-sheen inline-flex items-center justify-center h-11 px-6 rounded-md font-semibold text-sm">
                {d?.ctaBrowseLiveStores || 'Browse Live Stores'}
              </Link>
            </div>
            <p className="text-white/45 text-xs">{d?.ctaNoCC || 'No credit card required · 14-day free trial · Cancel anytime'}</p>
          </div>
        </div>

        {/* Companion app */}
        <div aria-labelledby="mobile-app-heading" role="region" style={{ ['--i' as string]: 1 }} className="mk-reveal lg:col-span-2 mk-glass backdrop-blur-md rounded-xl p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <FKey dark>APP</FKey>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-muted">{d?.mobileAppBadge || 'COMPANION APP'}</span>
          </div>
          <h2 id="mobile-app-heading" className="text-xl font-bold tracking-tight mb-2">
            {d?.mobileAppHeading || 'Get the 1POS companion app'}
          </h2>
          <p className="text-xs text-white/60 leading-relaxed mb-4">
            {d?.mobileAppDesc || 'Use your phone camera to scan QR codes and barcodes, and snap product photos straight into your catalog.'}
          </p>
          <ul className="grid gap-1.5 mb-5 flex-1">
            {[
              { Icon: ScanLine, title: d?.mobileAppScanTitle || 'Scan barcodes & QR codes', body: d?.mobileAppScanBody || 'Look up or add products instantly by scanning with your phone camera.' },
              { Icon: Camera, title: d?.mobileAppPhotoTitle || 'Add product photos', body: d?.mobileAppPhotoBody || 'Snap and upload product images directly from your phone to your catalog.' },
            ].map(({ Icon, ...f }) => (
              <li key={f.title} className="flex gap-2.5 rounded-md bg-white/[0.04] border border-white/10 px-3 py-2">
                <Icon className="w-4 h-4 mt-0.5 text-brand-muted flex-shrink-0" strokeWidth={2.25} aria-hidden="true" />
                <div>
                  <h3 className="text-[13px] font-semibold">{f.title}</h3>
                  <p className="text-[11px] text-white/55 leading-snug">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <a
            href="https://play.google.com/store/apps/details?id=com.app.onepos"
            target="_blank"
            rel="noopener noreferrer"
            className="mk-key-light mk-sheen inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md font-bold text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3.5v17a1 1 0 0 0 1.5.86l14.5-8.5a1 1 0 0 0 0-1.72L6.5 2.64A1 1 0 0 0 5 3.5z" /></svg>
            {d?.mobileAppGetItOn || 'Get it on Google Play'}
          </a>
        </div>
      </div>
    </section>
  );
}
