'use client';

/* "Every kind of counter": a stacked-deck photo carousel. Autoplay is driven by the
   progress bar's CSS animation finishing (onAnimationEnd), so pausing is just
   animation-play-state and reduced-motion users get no autoplay at all. */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, Coffee, CreditCard, Gem, MapPin, Moon, Shirt, Store } from 'lucide-react';
import { SectionHeader } from './ui';
import type { HomeDict } from './useMarketing';

type Slide = { img: string; alt: string; Icon: LucideIcon; title: string; desc: string; tags: string[]; place?: string };

export default function CounterCarousel({ d }: { d: HomeDict }) {
  const slides: Slide[] = [
    {
      img: '/images/marketing/sari-sari-cebu.webp',
      alt: 'A neighborhood sari-sari store stocked with snacks and prepaid load signs',
      Icon: Store,
      title: d?.ccSariTitle || 'Sari-sari & neighborhood stores',
      desc: d?.ccSariDesc || 'Big tap-keys for best-sellers, a cash drawer that counts itself, and a low-stock alert before the softdrinks run out.',
      tags: ['Quick keys', 'Cash drawer', 'Low-stock alerts'],
      place: 'Cebu City',
    },
    {
      img: '/images/marketing/cafe-counter.webp',
      alt: 'A barista preparing drinks behind a café counter',
      Icon: Coffee,
      title: d?.ccCafeTitle || 'Cafés & quick-service counters',
      desc: d?.ccCafeDesc || 'Ring up an order in seconds, take cash, card, or e-wallet, and print the OR while the espresso pulls.',
      tags: ['Fast checkout', 'Multiple tenders', 'Receipt printing'],
    },
    {
      img: '/images/marketing/boutique-pos.webp',
      alt: 'A shopper at a clothing boutique counter with a tablet point of sale',
      Icon: Shirt,
      title: d?.ccBoutiqueTitle || 'Boutiques & apparel',
      desc: d?.ccBoutiqueDesc || 'Sizes and colours as variations, barcode labels you print yourself, and stock that follows transfers between branches.',
      tags: ['Variations', 'Barcode labels', 'Branch transfers'],
    },
    {
      img: '/images/marketing/specialty-counter.webp',
      alt: 'A cashier serving two customers at a specialty store counter',
      Icon: Gem,
      title: d?.ccSpecialtyTitle || 'Specialty retail',
      desc: d?.ccSpecialtyDesc || 'Customer profiles, purchase history, and discount codes with usage limits — so regulars feel like regulars.',
      tags: ['Customer profiles', 'Purchase history', 'Discount codes'],
    },
    {
      img: '/images/marketing/convenience-night.webp',
      alt: 'A brightly lit convenience store at night',
      Icon: Moon,
      title: d?.ccNightTitle || '24-hour convenience',
      desc: d?.ccNightDesc || 'Shift clock-ins, a drawer session per cashier, and offline mode for when the line drops at 3 AM.',
      tags: ['Attendance', 'Drawer sessions', 'Offline mode'],
    },
    {
      img: '/images/marketing/card-reader.webp',
      alt: 'A customer tapping a card on a handheld card reader',
      Icon: CreditCard,
      title: d?.ccCardTitle || 'Card & e-wallet payments',
      desc: d?.ccCardDesc || 'Every tender recorded against the drawer, and every refund put back into stock automatically.',
      tags: ['Card & e-wallet', 'Refunds', 'Stock restore'],
    },
  ];
  const n = slides.length;

  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dragX = useRef<number | null>(null);
  const paused = hovered || focused;

  const go = (i: number) => setActive(((i % n) + n) % n);
  const next = () => go(active + 1);
  const prev = () => go(active - 1);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };
  const onPointerDown = (e: PointerEvent) => { dragX.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (dragX.current === null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
  };

  const slide = slides[active];

  return (
    <section
      aria-labelledby="counters-heading"
      className="relative overflow-hidden mk-dark text-white px-4 sm:px-6 py-12 md:py-16"
    >
      {/* Blurred backdrop cross-fades to the active photo */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {slides.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.img}
            src={s.img}
            alt=""
            loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover scale-110 blur-2xl transition-opacity duration-1000 ${i === active ? 'opacity-30' : 'opacity-0'}`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1620]/70 via-[#0a1620]/40 to-[#0a1620]/80" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <SectionHeader
          dark
          id="counters-heading"
          fkey="F1"
          eyebrow={d?.ccBadge || 'WHERE IT RUNS'}
          title={d?.ccHeading || 'Every kind of counter'}
          desc={d?.ccDesc || 'Same till, set up differently — here is what each kind of store leans on most.'}
        />

        <div
          role="region"
          aria-roledescription="carousel"
          aria-label={d?.ccHeading || 'Every kind of counter'}
          className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
          onKeyDown={onKeyDown}
        >
          {/* Caption + controls */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <div key={active} className="mk-hero-in" aria-live={paused ? 'polite' : 'off'}>
              <div className="flex items-center gap-2 mb-3">
                <span className="mk-key-brand w-9 h-9 rounded-md flex items-center justify-center">
                  <slide.Icon className="w-4.5 h-4.5" strokeWidth={2.25} aria-hidden="true" />
                </span>
                {slide.place && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-white/55">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {slide.place}
                  </span>
                )}
              </div>
              <h3 className="text-2xl md:text-[1.75rem] font-bold tracking-tight leading-tight mb-2">{slide.title}</h3>
              <p className="text-sm md:text-[15px] text-white/65 leading-relaxed mb-4 max-w-md">{slide.desc}</p>
              <ul className="flex flex-wrap gap-1.5 mb-6">
                {slide.tags.map((t) => (
                  <li key={t} className="mk-glass rounded px-2 py-1 text-[11px] font-medium text-white/80">{t}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={prev} aria-label="Previous counter" className="mk-key w-10 h-10 rounded-md flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <button type="button" onClick={next} aria-label="Next counter" className="mk-key w-10 h-10 rounded-md flex items-center justify-center">
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
              <span className="font-mono text-xs text-white/50 tabular-nums ml-1 whitespace-nowrap">
                {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
              </span>
              <div className="flex-1 flex gap-1" role="group" aria-label="Choose a counter">
                {slides.map((s, i) => (
                  <button
                    key={s.img}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={s.title}
                    aria-current={i === active}
                    className="relative flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden"
                  >
                    {i < active && <span className="absolute inset-0 bg-brand-muted/60" />}
                    {i === active && (
                      <span
                        key={active}
                        className="mk-progress absolute inset-0 bg-brand-muted"
                        style={{ animationPlayState: paused ? 'paused' : 'running' }}
                        onAnimationEnd={next}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stacked deck */}
          <div
            className="lg:col-span-7 order-1 lg:order-2 relative aspect-[4/3] sm:aspect-[16/10] touch-pan-y select-none mr-6 sm:mr-12 mt-6 sm:mt-10"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragX.current = null; }}
          >
            {slides.map((s, i) => {
              const offset = (i - active + n) % n;
              const style =
                offset === 0 ? 'z-30 opacity-100 [transform:none]'
                : offset === 1 ? 'z-20 opacity-90 [transform:translate(5%,-7%)_scale(0.92)_rotate(2.5deg)] brightness-[0.6]'
                : offset === 2 ? 'z-10 opacity-70 [transform:translate(10%,-14%)_scale(0.84)_rotate(5deg)] brightness-[0.45]'
                : offset === n - 1 ? 'z-40 opacity-0 [transform:translate(-35%,8%)_rotate(-9deg)] pointer-events-none'
                : 'z-0 opacity-0 [transform:translate(14%,-18%)_scale(0.8)_rotate(6deg)] pointer-events-none';
              return (
                <figure
                  key={s.img}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${n}: ${s.title}`}
                  aria-hidden={offset !== 0}
                  onClick={offset === 1 ? next : undefined}
                  className={`absolute inset-0 rounded-xl overflow-hidden ring-1 ring-white/15 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${offset === 1 ? 'cursor-pointer' : ''} ${style}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt={s.alt} loading="lazy" draggable={false} className="w-full h-full object-cover" />
                  {/* Gloss highlight */}
                  <span className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" aria-hidden="true" />
                  <figcaption className="absolute left-3 bottom-3 mk-glass backdrop-blur-md rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-semibold">
                    <s.Icon className="w-3.5 h-3.5 text-brand-muted" strokeWidth={2.25} aria-hidden="true" />
                    {s.title}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
