'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
  ArrowLeftRight,
  ArrowRight,
  BellRing,
  Camera,
  Download,
  Globe,
  ImagePlus,
  Moon,
  PackageCheck,
  Play,
  ScanLine,
  ShoppingBag,
  Sunrise,
  ShoppingBasket,
} from 'lucide-react';
import FeaturesGrid, { FEATURE_MODULE_COUNT } from '@/components/FeaturesGrid';
import { CORE_AUTOMATION_WORKFLOWS, UPTIME_SLA_TARGET_PERCENT } from '@/lib/marketing-constants';
import { formatActiveTenants, formatCompletedTransactions } from '@/lib/marketing-format';
import { TESTIMONIALS } from '@/lib/marketing-testimonials';
import Carousel from './Carousel';
import { Barcode, LineTag, ReceiptRow, type Translate } from './primitives';

export type PlatformStats = { activeTenants: number; completedTransactions: number } | 'loading' | 'failed';

/** End-of-day style reading. The hero receipt hangs over the right side of this band on desktop. */
export function ZReading({ t, stats }: { t: Translate; stats: PlatformStats }) {
  // Live counts only appear once they load, so visitors never see a placeholder or a zero.
  const liveRows =
    typeof stats === 'object' && stats.activeTenants > 0
      ? [
          { value: formatActiveTenants(stats.activeTenants), label: t('zStores', 'Active stores') },
          { value: formatCompletedTransactions(stats.completedTransactions), label: t('zSales', 'Completed sales') },
        ]
      : [];

  const rows = [
    ...liveRows,
    { value: String(FEATURE_MODULE_COUNT), label: t('zModules', 'Capability modules') },
    { value: String(CORE_AUTOMATION_WORKFLOWS), label: t('zAutomations', 'Automated workflows') },
    { value: UPTIME_SLA_TARGET_PERCENT, label: t('zUptime', 'Uptime target') },
    { value: '24/7', label: t('zSupport', 'Support') },
  ];

  return (
    <section aria-labelledby="zreading-heading" className="bg-brand text-ink">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20 xl:min-h-[32rem]">
        <div className="xl:max-w-[calc(100%-19rem)]">
          <p className="font-receipt text-xs font-medium uppercase tracking-[0.14em]">{t('zTag', 'Z-reading · all 1pos stores')}</p>
          <h2 id="zreading-heading" className="mt-4 text-5xl sm:text-6xl">
            {t('zHeading', 'The numbers so far')}
          </h2>
          <dl className="mt-10 grid grid-cols-2 gap-x-8">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-col-reverse justify-end border-t-2 border-ink py-4">
                <dt className="mt-2 font-receipt text-xs font-medium">{row.label}</dt>
                <dd className="font-led text-4xl leading-none sm:text-5xl">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export function ParallaxBand({ t }: { t: Translate }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-14%', '14%']);

  return (
    <section ref={ref} aria-labelledby="band-heading" className="relative overflow-hidden bg-ink text-paper-white">
      <motion.div className="absolute -inset-x-0 -top-[16%] h-[132%]" style={{ y: reduced ? 0 : y }}>
        <Image src="/images/home/antique-register.jpg" alt={t('bandAlt', 'Ornate antique brass cash register on a shop counter')} fill sizes="100vw" className="object-cover object-[50%_40%]" />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/60 to-ink/10" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[34rem] max-w-7xl flex-col justify-center px-4 py-24 sm:px-6 lg:min-h-[42rem] lg:px-8">
        <h2 id="band-heading" className="max-w-2xl text-5xl sm:text-6xl lg:text-8xl">
          {t('bandHeading', 'The till used to stay in the drawer')}
        </h2>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-paper/85">
          {t('bandBody', 'Now it follows you. Check today’s sales from your phone, move stock between branches and close the day without counting twice.')}
        </p>
      </div>
    </section>
  );
}

export function DayAtTheCounter({ t }: { t: Translate }) {
  const slips = [
    { time: '07:45', Icon: Sunrise, title: t('day1Title', 'Open the drawer'), body: t('day1Body', 'Count your starting cash and begin a session. Every peso from here on is tracked.') },
    { time: '12:30', Icon: ShoppingBasket, title: t('day2Title', 'Lunch rush'), body: t('day2Body', 'Scan, tap, next. Stock drops with each sale, so nobody sells what is not on the shelf.') },
    { time: '15:10', Icon: BellRing, title: t('day3Title', 'Low stock alert'), body: t('day3Body', 'You hear about the last few units before a customer finds an empty shelf.') },
    { time: '17:40', Icon: ShoppingBag, title: t('day4Title', 'Online order lands'), body: t('day4Body', 'A paid Shopify or WooCommerce order comes in as a POS transaction. Stock updates on both sides.') },
    { time: '21:00', Icon: Moon, title: t('day5Title', 'Close the day'), body: t('day5Body', 'The drawer closes on schedule, shortages and overages are flagged, and your report is ready.') },
  ];

  return (
    <section aria-labelledby="day-heading" className="bg-brand-navy-deep py-20 text-paper-white lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LineTag no="02" className="text-[#8fe3d0]">
          {t('dayTag', 'A day with 1pos')}
        </LineTag>
        <h2 id="day-heading" className="mb-12 mt-4 max-w-3xl text-5xl sm:text-6xl lg:text-7xl">
          {t('dayHeading', 'From opening float to final count')}
        </h2>
        <Carousel
          t={t}
          label={t('dayCarouselLabel', 'A day at the counter')}
          slideClassName="basis-[85%] sm:basis-1/2 lg:basis-1/3"
          buttonClassName="border-paper/40 hover:border-paper-white"
        >
          {slips.map((slip) => (
            <article key={slip.time} className="mk-tear-b flex h-full min-h-[21rem] flex-col bg-paper-white px-6 pb-10 pt-6 text-ink">
              <div className="flex items-start justify-between">
                <p className="font-led text-5xl leading-none">{slip.time}</p>
                <slip.Icon className="h-7 w-7 text-brand-hover" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="my-5 border-t border-dashed border-ink/40" />
              <h3 className="text-xl font-bold">{slip.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">{slip.body}</p>
            </article>
          ))}
        </Carousel>
      </div>
    </section>
  );
}

export function Modules({ t }: { t: Translate }) {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 bg-paper-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <LineTag no="03">{t('featuresTag', 'Itemized')}</LineTag>
            <h2 id="features-heading" className="mt-4 text-5xl sm:text-6xl lg:text-7xl">
              {t('featuresHeading', '{n} modules, one bill').replace('{n}', String(FEATURE_MODULE_COUNT))}
            </h2>
          </div>
          <p className="leading-relaxed text-ink/75 lg:col-span-4">
            {t('featuresDesc', 'Everything from the counter to the back office. Open any line to see what is included.')}
          </p>
        </div>
        <div className="mt-12">
          <FeaturesGrid />
        </div>
      </div>
    </section>
  );
}

export function Solutions({ t }: { t: Translate }) {
  return (
    <section id="solutions" aria-labelledby="solutions-heading" className="scroll-mt-20 bg-paper py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LineTag no="04">{t('solutionsTag', 'Who it is for')}</LineTag>
        <h2 id="solutions-heading" className="mb-12 mt-4 text-5xl sm:text-6xl lg:text-7xl">
          {t('solutionsHeading', 'Built for your business')}
        </h2>
        <div className="grid gap-5 lg:grid-cols-12">
          <article className="group relative min-h-[26rem] overflow-hidden bg-ink lg:col-span-7">
            <Image src="/images/home/fresh-produce.jpg" alt={t('retailAlt', 'Produce section of a grocery store')} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-x-0 bottom-0 bg-paper-white p-6 lg:right-auto lg:w-[26rem]">
              <h3 className="font-display text-4xl font-extrabold uppercase leading-none">{t('retailName', 'Retail')}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">
                {t('retailDesc', 'Groceries, minimarts and shops with shelves to keep full: barcodes, variants, bundles and stock per branch.')}
              </p>
            </div>
          </article>
          <article className="group relative min-h-[26rem] overflow-hidden bg-ink lg:col-span-5">
            <Image src="/images/home/hardware-store.jpg" alt={t('generalAlt', 'Hardware store with goods stacked on shelves')} fill sizes="(min-width: 1024px) 42vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-x-0 bottom-0 bg-paper-white p-6">
              <h3 className="font-display text-4xl font-extrabold uppercase leading-none">{t('generalName', 'General')}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">
                {t('generalDesc', 'Anything else that sells over a counter. Turn on only the modules you need.')}
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function Ecommerce({ t }: { t: Translate }) {
  const notes = [
    { Icon: ArrowLeftRight, title: t('ecomNote1Title', 'Two-way stock'), body: t('ecomNote1Body', 'Sell in store or online and the other side updates, so you avoid overselling.') },
    { Icon: PackageCheck, title: t('ecomNote2Title', 'Catalog sync'), body: t('ecomNote2Body', 'Match products by SKU, pull product data and keep listings aligned.') },
    { Icon: Download, title: t('ecomNote3Title', 'Order import'), body: t('ecomNote3Body', 'Paid online orders arrive as POS transactions, without duplicates.') },
  ];

  return (
    <section id="ecommerce" aria-labelledby="ecommerce-heading" className="scroll-mt-20 bg-brand text-ink">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-28">
        <div className="lg:col-span-5">
          <LineTag no="05">{t('ecomTag', 'Online and in store')}</LineTag>
          <h2 id="ecommerce-heading" className="mt-4 text-5xl sm:text-6xl lg:text-7xl">
            {t('ecomHeading', 'One shelf, two storefronts')}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed">
            {t('ecomDesc', 'Connect Shopify or WooCommerce to your POS and keep one count of what you actually have.')}
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-ink p-5 text-paper-white sm:gap-4 sm:p-8" aria-hidden="true">
            <div className="border border-paper/30 p-3 text-center sm:p-4">
              <Globe className="mx-auto h-6 w-6 text-[#8fe3d0]" strokeWidth={1.75} />
              <p className="mt-2 text-sm font-semibold">Shopify</p>
              <p className="font-receipt text-[11px] text-paper/60">WooCommerce</p>
            </div>
            <ArrowLeftRight className="h-6 w-6 text-[#8fe3d0]" />
            <div className="border border-paper/30 p-3 text-center sm:p-4">
              <ScanLine className="mx-auto h-6 w-6 text-[#8fe3d0]" strokeWidth={1.75} />
              <p className="mt-2 text-sm font-semibold">{t('ecomCounter', 'Your counter')}</p>
              <p className="font-receipt text-[11px] text-paper/60">1pos</p>
            </div>
            <div className="col-span-3 mt-3 flex items-end justify-between border-t border-paper/20 pt-4">
              <span className="font-receipt text-xs text-paper/70">{t('ecomStockLabel', 'Rice 5kg Sack · in stock')}</span>
              <span className="mk-led-glow font-led text-5xl leading-none text-[#7df0d6]">48</span>
            </div>
          </div>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {notes.map((note) => (
              <li key={note.title}>
                <note.Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="mt-2 font-bold">{note.title}</h3>
                <p className="mt-1 text-sm leading-relaxed">{note.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Real quotes only, from lib/marketing-testimonials.ts. Renders nothing until that list has entries. */
export function Testimonials({ t }: { t: Translate }) {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="scroll-mt-20 bg-paper-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LineTag no="CC">{t('testimonialsTag', 'Customer copy')}</LineTag>
        <h2 id="testimonials-heading" className="mb-12 mt-4 text-5xl sm:text-6xl lg:text-7xl">
          {t('testimonialsHeading', 'From behind the counter')}
        </h2>
        <Carousel t={t} label={t('testimonialsCarouselLabel', 'Customer stories')} slideClassName="basis-full lg:basis-[72%]" buttonClassName="border-ink/40 hover:border-ink">
          {TESTIMONIALS.map((item) => (
            <figure key={item.name} className="flex h-full flex-col justify-between border-2 border-ink p-7 sm:p-10">
              <blockquote className="text-2xl font-medium leading-snug sm:text-3xl">
                <p>&ldquo;{item.quote}&rdquo;</p>
              </blockquote>
              <figcaption className="mt-8 font-receipt text-sm">
                <ReceiptRow label={<cite className="not-italic">{item.name}</cite>} value={item.role} />
              </figcaption>
            </figure>
          ))}
        </Carousel>
      </div>
    </section>
  );
}

export function CompanionApp({ t }: { t: Translate }) {
  return (
    <section aria-labelledby="app-heading" className="overflow-hidden bg-brand-navy text-paper-white">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-20 sm:px-6 lg:grid-cols-12 lg:px-8 lg:pt-0">
        <div className="lg:col-span-7 lg:py-24">
          <LineTag no="06" className="text-[#8fe3d0]">
            {t('appTag', 'In your pocket')}
          </LineTag>
          <h2 id="app-heading" className="mt-4 text-5xl sm:text-6xl lg:text-7xl">
            {t('appHeading', 'Your phone is a scanner too')}
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-paper/85">
            {t('appDesc', 'The 1pos companion app reads barcodes and QR codes with your camera and sends product photos straight to your catalog.')}
          </p>
          <ul className="mt-6 space-y-3">
            <li className="flex items-center gap-3">
              <Camera className="h-5 w-5 text-[#8fe3d0]" aria-hidden="true" />
              {t('appPoint1', 'Scan to look up or add products')}
            </li>
            <li className="flex items-center gap-3">
              <ImagePlus className="h-5 w-5 text-[#8fe3d0]" aria-hidden="true" />
              {t('appPoint2', 'Snap and upload product photos')}
            </li>
          </ul>
          <a
            href="https://play.google.com/store/apps/details?id=com.app.onepos"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-3 bg-paper-white px-6 py-4 font-semibold text-ink hover:bg-brand-soft"
          >
            <Play className="h-5 w-5 fill-current" aria-hidden="true" />
            {t('appGetItOn', 'Get it on Google Play')}
          </a>
        </div>

        {/* Phone rising out of the section's bottom edge */}
        <div className="flex justify-center self-end lg:col-span-5" aria-hidden="true">
          <div className="h-[22rem] w-60 border-[10px] border-b-0 border-ink bg-ink lg:mt-16 lg:h-[24rem]">
            <div className="relative h-full overflow-hidden bg-paper-white text-ink">
              <div className="bg-ink px-3 py-2 font-receipt text-[11px] text-paper-white">{t('appScreenTitle', 'Scan product')}</div>
              <div className="relative mx-5 mt-8 h-32 border-2 border-ink/20 p-5">
                <Barcode className="h-full w-full text-ink" />
                <span className="mk-sweep" />
              </div>
              <div className="mx-5 mt-6 font-receipt text-xs">
                <ReceiptRow label="Rice 5kg Sack" value="₱350.00" strong />
                <ReceiptRow label={t('appScreenStock', 'In stock')} value="48" />
              </div>
              <div className="mx-5 mt-6 bg-brand py-2.5 text-center text-sm font-semibold text-ink">{t('appScreenButton', 'Add to catalog')}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The page closes on the bill: nothing to pay today. */
export function FinalReceipt({ t }: { t: Translate }) {
  return (
    <section aria-labelledby="cta-heading" className="bg-paper pb-0 pt-20 lg:pt-28">
      <div className="mx-auto grid max-w-7xl items-end gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="pb-20 lg:col-span-6 lg:pb-28">
          <LineTag no="07">{t('ctaTag', 'Your total')}</LineTag>
          <h2 id="cta-heading" className="mt-4 text-6xl sm:text-7xl lg:text-8xl">
            {t('ctaHeading', 'Ring up your first sale today')}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/75">
            {t('ctaDesc', 'Set up your store, add a few products and try it at the counter. If it is not for you, walk away and owe nothing.')}
          </p>
        </div>

        <div className="mx-auto w-full max-w-md lg:col-span-5 lg:col-start-8">
          <div className="drop-shadow-[0_18px_22px_rgb(16_32_43/0.25)]">
            <div className="mk-tear-t bg-paper-white px-7 pb-8 pt-10 font-receipt text-sm">
              <p className="text-center font-display text-3xl font-extrabold uppercase leading-none">1pos</p>
              <p className="mt-1 text-center text-xs">{t('ctaReceiptTitle', 'Free trial, itemized')}</p>
              <div className="my-4 border-t border-dashed border-ink/40" />
              <div className="space-y-1.5">
                <ReceiptRow label={t('ctaLine1', '14-day trial')} value="₱0.00" />
                <ReceiptRow label={t('ctaLine2', 'Credit card needed')} value={t('ctaNone', 'NONE')} />
                <ReceiptRow label={t('ctaLine4', 'Cancel anytime')} value="₱0.00" />
              </div>
              <div className="my-4 border-t border-dashed border-ink/40" />
              <p className="text-xs">{t('ctaDue', 'TOTAL DUE TODAY')}</p>
              <p className="mt-1 text-5xl font-semibold leading-none tracking-tight">₱0.00</p>
              <Link
                href="/signup"
                className="group mt-6 flex items-center justify-center gap-2 bg-ink px-6 py-4 font-body font-semibold text-paper-white hover:bg-brand-navy"
              >
                {t('startFreeTrial', 'Start free trial')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link href="/stores" className="mt-3 block py-1 text-center text-xs underline underline-offset-4">
                {t('browseLiveStores', 'Browse live stores')}
              </Link>
              <Barcode className="mt-6 h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
