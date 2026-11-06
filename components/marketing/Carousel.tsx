'use client';

import { Children, useEffect, useState, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Translate } from './primitives';

type CarouselProps = {
  label: string;
  children: ReactNode;
  /** Width of each slide, as Tailwind flex-basis classes. */
  slideClassName: string;
  /** Tailwind classes for the arrows, so they read on light and dark sections. */
  buttonClassName: string;
  t: Translate;
};

export default function Carousel({ label, children, slideClassName, buttonClassName, t }: CarouselProps) {
  const [viewportRef, embla] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps' });
  const [selected, setSelected] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const slides = Children.toArray(children);

  useEffect(() => {
    if (!embla) return;
    const sync = () => {
      setSelected(embla.selectedScrollSnap());
      setSnapCount(embla.scrollSnapList().length);
    };
    embla.on('init', sync).on('select', sync).on('reInit', sync);
    return () => {
      embla.off('init', sync).off('select', sync).off('reInit', sync);
    };
  }, [embla]);

  const button = `flex h-11 w-11 items-center justify-center border-2 disabled:opacity-30 ${buttonClassName}`;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={viewportRef} className="overflow-hidden">
        <div className="-ml-5 flex touch-pan-y">
          {slides.map((slide, i) => (
            <div key={i} role="group" aria-roledescription="slide" className={`min-w-0 shrink-0 grow-0 pl-5 ${slideClassName}`}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 flex items-center gap-3">
        <button type="button" onClick={() => embla?.scrollPrev()} disabled={selected === 0} aria-label={t('carouselPrev', 'Previous')} className={button}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => embla?.scrollNext()}
          disabled={snapCount > 0 && selected >= snapCount - 1}
          aria-label={t('carouselNext', 'Next')}
          className={button}
        >
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
        {snapCount > 1 && (
          <span className="ml-1 font-receipt text-xs" aria-live="polite">
            {String(selected + 1).padStart(2, '0')} / {String(snapCount).padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
}
