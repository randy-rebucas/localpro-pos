import type { LucideIcon } from 'lucide-react';
import { Banknote, ChartColumn, Clock, Mail, PackageSearch, ShieldCheck, Timer, TrendingUp, Network } from 'lucide-react';
import { FEATURE_MODULE_COUNT } from './FeaturesGrid';
import { SectionHeader } from './ui';
import type { HomeDict } from './useMarketing';
import { CORE_AUTOMATION_WORKFLOWS, UPTIME_SLA_TARGET_PERCENT } from '@/lib/marketing-constants';

function ReceiptMockup() {
  const lines: [string, string][] = [
    ['T-Shirt (M, Blue)', '599.00'],
    ['Coffee Mug', '250.00'],
    ['Tote Bag', '180.00'],
  ];
  return (
    <div className="relative" aria-hidden="true">
      <div className="mk-key rounded-xl p-3">
        {/* Printer slot */}
        <div className="h-1.5 rounded-full bg-black/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)] mx-3 mb-0.5" />
        <div className="mk-print bg-[#fbfaf6] mx-1 px-4 pt-3 pb-5 font-mono text-[11px] text-gray-700 [clip-path:polygon(0_0,100%_0,100%_100%,96%_98%,92%_100%,88%_98%,84%_100%,80%_98%,76%_100%,72%_98%,68%_100%,64%_98%,60%_100%,56%_98%,52%_100%,48%_98%,44%_100%,40%_98%,36%_100%,32%_98%,28%_100%,24%_98%,20%_100%,16%_98%,12%_100%,8%_98%,4%_100%,0_98%)]">
          <div className="text-center">
            <div className="font-bold text-sm text-gray-900">SANTOS RETAIL</div>
            <div className="text-gray-500">123 Main St, Makati City</div>
            <div className="text-gray-500">VAT REG TIN: 123-456-789-000</div>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-gray-500"><span>OR No. 0000048821</span><span>22:41</span></div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          {lines.map(([item, price]) => (
            <div key={item} className="flex justify-between"><span>{item}</span><span>{price}</span></div>
          ))}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-gray-500"><span>VATable sales</span><span>918.75</span></div>
          <div className="flex justify-between text-gray-500"><span>VAT (12%)</span><span>110.25</span></div>
          <div className="flex justify-between font-bold text-gray-900 text-[13px] mt-1"><span>TOTAL</span><span>₱1,029.00</span></div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-center text-gray-500">Z-READING · DRAWER 02 CLOSED</div>
          <div className="text-center text-gray-400">Expected ₱18,240.00 · Counted ₱18,240.00</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {[
            { v: String(FEATURE_MODULE_COUNT), l: 'Modules' },
            { v: String(CORE_AUTOMATION_WORKFLOWS), l: 'Automations' },
            { v: UPTIME_SLA_TARGET_PERCENT, l: 'Uptime target' },
          ].map((s) => (
            <div key={s.l} className="mk-lcd rounded px-1 py-1.5 text-center">
              <div className="text-sm font-bold leading-none">{s.v}</div>
              <div className="text-[8px] uppercase tracking-wider opacity-70 mt-1 truncate">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WhySection({ d }: { d: HomeDict }) {
  // Times mirror the Vercel Cron schedules in vercel.json, shown in Manila time (UTC+8).
  const nightLog: { time: string; Icon: LucideIcon; title: string; desc: string }[] = [
    { time: d?.nightEveryHour || 'Every hour', Icon: PackageSearch, title: d?.nightStockTitle || 'Low-stock check', desc: d?.nightStockDesc || 'Items under their reorder point get flagged before tomorrow’s rush.' },
    { time: d?.nightEvery2h || 'Every 2 hrs', Icon: Clock, title: d?.nightClockoutTitle || 'Forgotten clock-outs closed', desc: d?.nightClockoutDesc || 'Staff who left without clocking out are closed out, so payroll hours stay honest.' },
    { time: d?.nightEvery6h || 'Every 6 hrs', Icon: Mail, title: d?.nightReceiptTitle || 'Receipts emailed', desc: d?.nightReceiptDesc || 'Customers who left an email address get their receipt automatically.' },
    { time: '11:00 PM', Icon: Banknote, title: d?.nightDrawerTitle || 'Open drawers closed', desc: d?.nightDrawerDesc || 'Any cash drawer left open is closed and its count checked against expected cash.' },
    { time: '7:00 AM', Icon: ChartColumn, title: d?.nightReportTitle || 'Daily sales report', desc: d?.nightReportDesc || 'Yesterday’s sales by branch, waiting in your inbox before you open.' },
  ];
  const benefits: { Icon: LucideIcon; title: string; desc: string }[] = [
    { Icon: Timer, title: d?.saveTimeTitle || 'Save Time', desc: d?.saveTimeDesc || 'Seven core automations cut repetitive tasks' },
    { Icon: TrendingUp, title: d?.increaseRevenueTitle || 'Increase Revenue', desc: d?.increaseRevenueDesc || 'Advanced analytics help identify growth opportunities' },
    { Icon: ShieldCheck, title: d?.reduceErrorsTitle || 'Reduce Errors', desc: d?.reduceErrorsDesc || 'Real-time validation prevents costly mistakes' },
    { Icon: Network, title: d?.scaleEasilyTitle || 'Scale Easily', desc: d?.scaleEasilyDesc || 'Multi-tenant architecture grows with your business' },
  ];

  return (
    <section aria-labelledby="highlights-heading" className="px-4 sm:px-6 py-12 md:py-16 bg-white">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          id="highlights-heading"
          fkey="F3"
          eyebrow={d?.highlightsBadge || 'AFTER HOURS'}
          title={d?.highlightsHeading || 'The night shift runs itself'}
          desc={d?.highlightsDesc || 'After you lock up, 1pos closes the drawer, chases forgotten clock-outs, and puts yesterday’s numbers in your inbox before you open.'}
        />

        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-10">
          {/* Shift log */}
          <ol className="lg:col-span-7 relative">
            <span className="absolute left-[7.125rem] top-2 bottom-2 w-px bg-gradient-to-b from-brand/60 via-gray-200 to-brand/60" aria-hidden="true" />
            {nightLog.map(({ time, Icon, title, desc }, i) => (
              <li key={title} className="mk-reveal relative flex items-start gap-4 py-2.5" style={{ ['--i' as string]: i }}>
                <span className="w-20 pt-2.5 text-right whitespace-nowrap font-mono text-[11px] font-semibold text-gray-400 flex-shrink-0">{time}</span>
                <span className="relative z-10 mk-key-brand w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="lg:col-span-5 max-w-sm w-full mx-auto">
            <ReceiptMockup />
          </div>
        </div>

        <h3 className="mk-reveal text-lg font-bold text-gray-900 tracking-tight mb-3">
          {d?.benefitsHeading || 'Less double-checking, more selling'}
        </h3>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Key business benefits">
          {benefits.map(({ Icon, title, desc }, i) => (
            <li key={title} className="mk-reveal group flex gap-3 rounded-lg border border-gray-200 p-3 hover:border-brand/40 hover:bg-brand-soft/40 transition-colors" style={{ ['--i' as string]: i }}>
              <Icon className="w-5 h-5 text-brand flex-shrink-0 mt-0.5 transition-transform group-hover:scale-110" strokeWidth={2} aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold text-sm text-gray-900">{title}</div>
                <p className="text-xs text-gray-500 leading-snug">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
