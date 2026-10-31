import { Boxes, ChartColumn, ScanBarcode } from 'lucide-react';
import FeaturesGrid, { FEATURE_MODULE_COUNT } from './FeaturesGrid';
import { SectionHeader } from './ui';
import type { HomeDict } from './useMarketing';

export default function FeaturesSection({ d }: { d: HomeDict }) {
  const spotlights = [
    {
      Icon: ScanBarcode,
      label: d?.posLabel || 'Point of Sale',
      headline: d?.posHeadline || 'Sell faster, smarter',
      body: d?.posBody || 'Full POS with cart, barcode scanning, multiple payment methods, and BIR-compliant official receipt printing.',
      key: 'mk-key-brand',
    },
    {
      Icon: Boxes,
      label: d?.inventoryLabel || 'Inventory',
      headline: d?.inventoryHeadline || 'Always in stock, never guessing',
      body: d?.inventoryBody || 'Real-time stock tracking across branches, automatic deductions on sale, low-stock alerts, and transfer management.',
      key: 'mk-key',
    },
    {
      Icon: ChartColumn,
      label: d?.reportsLabel || 'Reports & Analytics',
      headline: d?.reportsHeadline || 'Know your numbers',
      body: d?.reportsBody || 'Daily, weekly, and monthly sales reports, P&L statements, VAT summaries, and exportable data in CSV, Excel, or PDF.',
      key: 'mk-key',
    },
  ];

  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-14 px-4 sm:px-6 py-12 md:py-16 bg-[#eef3f5]">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          id="features-heading"
          fkey="F2"
          eyebrow={d?.featuresBadge || 'THE MODULES'}
          title={d?.featuresHeading || `${FEATURE_MODULE_COUNT} modules. One login.`}
          desc={d?.featuresDesc || 'From the cash drawer to the VAT summary, it ships in the box. Tap any tile to see what is inside.'}
        />

        <div className="grid md:grid-cols-3 gap-2 mb-8">
          {spotlights.map(({ Icon, ...s }, i) => (
            <div key={s.label} className="mk-panel mk-sheen mk-reveal group rounded-lg p-4 flex gap-3" style={{ ['--i' as string]: i }}>
              <span className={`${s.key} w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5`} aria-hidden="true">
                <Icon className="w-5 h-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{s.label}</div>
                <h3 className="text-[15px] font-bold text-gray-900 leading-tight mb-1">{s.headline}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        <FeaturesGrid />
      </div>
    </section>
  );
}
