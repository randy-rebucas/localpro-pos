'use client';

import { useSyncExternalStore } from 'react';

function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}
/** Floored to the minute so the snapshot stays stable between ticks. */
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

/** The till's LED strip: the time, as the register shows it. Empty on the server to avoid a hydration mismatch. */
export default function LedClock({ lang, className = '' }: { lang: string; className?: string }) {
  const minute = useSyncExternalStore(subscribeClock, currentMinute, () => null);
  if (minute === null) return null;

  const now = new Date(minute);
  const locale = lang === 'es' ? 'es' : 'en';
  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div className={`flex items-center justify-between gap-3 border border-white/15 bg-black/30 px-3 py-1.5 ${className}`} aria-hidden>
      <span className="font-led text-xl leading-none text-[#7df0d6] mk-led-glow">{time}</span>
      <span className="whitespace-nowrap font-receipt text-[11px] uppercase tracking-[0.06em] text-paper/60">{date}</span>
    </div>
  );
}
