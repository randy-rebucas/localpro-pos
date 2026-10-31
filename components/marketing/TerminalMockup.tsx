'use client';

/* Decorative register for the hero (aria-hidden). It rings up a sale on a loop:
   keys get tapped, lines land on the ticket, the card is charged, an OR slip prints.
   With prefers-reduced-motion it shows the finished sale and stays still. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, CreditCard, Banknote, Smartphone, Wifi } from 'lucide-react';
import { BrandMark } from '@/components/BrandLogo';

const CATEGORIES = ['All', 'Apparel', 'Home', 'Grocery', 'Tech'];

const KEYS = [
  { name: 'T-Shirt (M)', price: 599, stripe: 'bg-brand' },
  { name: 'Coffee Mug', price: 250, stripe: 'bg-amber-400' },
  { name: 'Tote Bag', price: 180, stripe: 'bg-brand' },
  { name: 'Bottled Water', price: 25, stripe: 'bg-sky-400' },
  { name: 'Instant Coffee', price: 220, stripe: 'bg-sky-400' },
  { name: 'Snack Pack', price: 75, stripe: 'bg-sky-400' },
  { name: 'USB-C Cable', price: 250, stripe: 'bg-violet-400' },
  { name: 'Phone Case', price: 299, stripe: 'bg-violet-400' },
  { name: 'AA Batteries', price: 120, stripe: 'bg-violet-400' },
  { name: 'Notebook A5', price: 350, stripe: 'bg-amber-400' },
  { name: 'Umbrella', price: 450, stripe: 'bg-amber-400' },
  { name: 'Sunscreen', price: 385, stripe: 'bg-emerald-400' },
];

/** Key indexes tapped, in order. */
const SCRIPT = [0, 1, 1, 3, 3, 3, 2];

type Phase = 'ringing' | 'charging' | 'paid';

const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases a displayed number toward `target`. */
function useTween(target: number, ms = 380) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      const v = a + (target - a) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export default function TerminalMockup() {
  const reduced = useSyncExternalStore(subscribeMotion, prefersReducedMotion, () => false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('ringing');
  const [orNo, setOrNo] = useState(48822);

  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'ringing') {
      t = step < SCRIPT.length
        ? setTimeout(() => setStep((s) => s + 1), step === 0 ? 1100 : 620)
        : setTimeout(() => setPhase('charging'), 800);
    } else if (phase === 'charging') {
      t = setTimeout(() => setPhase('paid'), 1300);
    } else {
      t = setTimeout(() => {
        setStep(0);
        setPhase('ringing');
        setOrNo((n) => n + 1);
      }, 4200);
    }
    return () => clearTimeout(t);
  }, [step, phase, reduced]);

  const shownStep = reduced ? SCRIPT.length : step;
  const shownPhase: Phase = reduced ? 'paid' : phase;

  // Aggregate tapped keys into ticket lines, in first-tapped order.
  const lines: { idx: number; qty: number }[] = [];
  for (const idx of SCRIPT.slice(0, shownStep)) {
    const line = lines.find((l) => l.idx === idx);
    if (line) line.qty += 1;
    else lines.push({ idx, qty: 1 });
  }
  const total = lines.reduce((sum, l) => sum + KEYS[l.idx].price * l.qty, 0);
  const vat = (total / 1.12) * 0.12;
  const shownTotal = useTween(total);
  const tappedKey = shownPhase === 'ringing' && shownStep > 0 ? SCRIPT[shownStep - 1] : null;

  return (
    <div className="relative select-none pb-16" aria-hidden="true">
      {/* Bezel */}
      <div className="relative z-10 rounded-xl p-2 bg-gradient-to-b from-[#2b3f4f] to-[#0e1a24] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-black/60">
        <div className="rounded-lg overflow-hidden bg-[#0b1720] ring-1 ring-white/5 text-[11px]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-3 h-8 bg-gradient-to-b from-white/[0.08] to-transparent border-b border-white/10 text-white/70">
            <div className="flex items-center gap-2 min-w-0">
              <BrandMark className="w-4 h-4" />
              <span className="font-semibold text-white truncate">Main Branch · Till 02</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="hidden sm:inline">Cashier: Ana</span>
              <span className="flex items-center gap-1 text-emerald-300">
                <Wifi className="w-3 h-3" strokeWidth={2.5} />
                Synced
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5">
            {/* Product keys */}
            <div className="sm:col-span-3 p-2.5 border-b sm:border-b-0 sm:border-r border-white/10">
              <div className="flex gap-1 mb-2 overflow-hidden">
                {CATEGORIES.map((c, i) => (
                  <span key={c} className={`${i === 0 ? 'mk-key-brand' : 'mk-key'} px-2.5 py-1 rounded text-[10px] font-semibold whitespace-nowrap`}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {KEYS.map((k, i) => (
                  <div
                    key={k.name}
                    className={`mk-key rounded-md px-2 pt-2 pb-1.5 overflow-hidden ${tappedKey === i ? 'translate-y-[2px] brightness-125' : ''}`}
                  >
                    <span className={`absolute left-0 top-0 bottom-0 w-1 ${k.stripe}`} />
                    {tappedKey === i && <span key={shownStep} className="mk-tap-flash" />}
                    <div className="font-semibold text-white/90 truncate leading-tight">{k.name}</div>
                    <div className="font-mono text-[10px] text-brand-muted mt-0.5">₱{k.price}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket */}
            <div className="sm:col-span-2 p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase tracking-wider font-semibold">
                <span>Ticket #{orNo - 1}</span>
                <span>Walk-in</span>
              </div>
              <div className="flex-1 space-y-1 min-h-[118px]">
                {lines.length === 0 && (
                  <div className="px-1.5 py-1 font-mono text-white/35">
                    Scan or tap an item<span className="mk-cursor">_</span>
                  </div>
                )}
                {lines.map((l) => (
                  <div key={l.idx} className="mk-line-in flex items-baseline gap-1.5 rounded px-1.5 py-1 bg-white/[0.04]">
                    <span key={l.qty} className="mk-lcd-on font-mono text-brand-muted w-5">{l.qty}×</span>
                    <span className="flex-1 truncate text-white/85">{KEYS[l.idx].name}</span>
                    <span className="font-mono text-white/90">{peso(KEYS[l.idx].price * l.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="font-mono text-[10px] text-white/55 space-y-0.5 px-1">
                <div className="flex justify-between"><span>Items</span><span>{shownStep}</span></div>
                <div className="flex justify-between"><span>VAT 12% (incl.)</span><span>{peso(vat)}</span></div>
              </div>
              <div className="mk-lcd rounded-md px-2.5 py-2 flex items-baseline justify-between">
                <span className="text-[10px] tracking-widest opacity-80">{shownPhase === 'paid' ? 'PAID' : 'TOTAL'}</span>
                <span className="text-xl font-bold tracking-tight tabular-nums">₱{peso(shownTotal)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'CASH', Icon: Banknote },
                  { label: 'CARD', Icon: CreditCard },
                  { label: 'E-WALLET', Icon: Smartphone },
                ].map(({ label, Icon }) => {
                  const active = label === 'CARD' && shownPhase !== 'ringing';
                  return (
                    <span
                      key={label}
                      className={`${active ? 'mk-key-brand' : 'mk-key'} rounded flex items-center justify-center gap-1 py-1.5 text-[9px] font-bold tracking-wider`}
                    >
                      <Icon className="w-3 h-3" strokeWidth={2.5} />
                      {label}
                    </span>
                  );
                })}
              </div>
              <span
                className={`${shownPhase === 'paid' ? 'mk-key bg-emerald-600! text-emerald-50' : 'mk-key-brand'} rounded-md flex items-center justify-center gap-1.5 py-2 text-xs font-bold tracking-widest`}
              >
                {shownPhase === 'ringing' && <>PAY ₱{peso(total)}</>}
                {shownPhase === 'charging' && (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    CHARGING CARD
                  </>
                )}
                {shownPhase === 'paid' && (
                  <>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    APPROVED
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt slip feeding out of the printer slot */}
      <div className="absolute right-6 sm:right-10 top-[calc(100%-4.5rem)] w-52 h-[4.5rem] overflow-hidden">
        {shownPhase === 'paid' && (
          <div key={orNo} className="mk-slip bg-[#fbfaf6] text-gray-700 font-mono text-[10px] px-3 pt-2 pb-2.5 shadow-lg [clip-path:polygon(0_0,100%_0,100%_100%,95%_94%,90%_100%,85%_94%,80%_100%,75%_94%,70%_100%,65%_94%,60%_100%,55%_94%,50%_100%,45%_94%,40%_100%,35%_94%,30%_100%,25%_94%,20%_100%,15%_94%,10%_100%,5%_94%,0_100%)]">
            <div className="flex justify-between font-bold text-gray-900"><span>OFFICIAL RECEIPT</span><span>BIR</span></div>
            <div className="flex justify-between"><span>OR No.</span><span>{String(orNo).padStart(10, '0')}</span></div>
            <div className="flex justify-between"><span>CARD ••4417</span><span>₱{peso(total)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
