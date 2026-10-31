import { ArrowLeftRight, Globe, PackageSearch, ReceiptText, ShoppingBag, Store } from 'lucide-react';
import { SectionHeader } from './ui';
import type { HomeDict } from './useMarketing';

export default function SolutionsSection({ d }: { d: HomeDict }) {
  const businessTypes = [
    { Icon: ShoppingBag, name: 'Retail', desc: d?.retailDesc || 'Product & inventory focused', img: '/images/business/retail.jpg', alt: 'Retail store' },
    { Icon: Store, name: 'General', desc: d?.generalDesc || 'Fully flexible setup', img: '/images/business/general.jpg', alt: 'General business' },
  ];
  const channels = [
    {
      Icon: ShoppingBag,
      title: d?.ecommerceShopifyTitle || 'Shopify',
      body: d?.ecommerceShopifyBody || 'Secure OAuth, expiring offline tokens, catalog sync, inventory levels at your default location, paid order import, and webhooks — so your storefront and counter stay aligned.',
    },
    {
      Icon: Globe,
      title: d?.ecommerceWooTitle || 'WooCommerce',
      body: d?.ecommerceWooBody || 'Connect your WordPress store with REST keys: pull products, map SKUs to POS items, push available quantity after sales, and process order webhooks with HMAC verification.',
    },
  ];
  const capabilities = [
    { Icon: ArrowLeftRight, title: d?.ecommerceCard1Title || 'Two-way inventory', body: d?.ecommerceCard1Body || 'When you sell in-store or online, stock updates flow to the other channel so you avoid overselling.' },
    { Icon: PackageSearch, title: d?.ecommerceCard2Title || 'Catalog sync', body: d?.ecommerceCard2Body || 'Link channel variants to POS products by SKU, pull product data, and keep listings aligned with one click.' },
    { Icon: ReceiptText, title: d?.ecommerceCard3Title || 'Order import', body: d?.ecommerceCard3Body || 'Paid Shopify orders and qualifying WooCommerce orders can create POS transactions with idempotent handling.' },
  ];

  return (
    <section className="relative mk-dark text-white px-4 sm:px-6 py-12 md:py-16 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/marketing/warehouse.webp" alt="" loading="lazy" className="mk-parallax opacity-40 absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1620] via-[#0a1620]/70 to-[#0a1620]" />
      </div>
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-12">
        {/* Business types */}
        <div id="solutions" aria-labelledby="solutions-heading" className="scroll-mt-14" role="region">
          <SectionHeader
            dark
            id="solutions-heading"
            fkey="F4"
            eyebrow={d?.solutionsBadge || 'BUSINESS TYPE'}
            title={d?.solutionsHeading || 'Set up for how you sell'}
            desc={d?.solutionsDesc || 'Industry-specific configurations tailored to your business model'}
          />
          <div className="grid grid-cols-2 gap-2">
            {businessTypes.map(({ Icon, ...t }, i) => (
              <div key={t.name} style={{ ['--i' as string]: i }} className="mk-reveal group relative rounded-lg overflow-hidden ring-1 ring-white/10 aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.img} alt={t.alt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1620] via-[#0a1620]/40 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" aria-hidden="true" />
                <div className="absolute inset-x-2 bottom-2 mk-glass rounded-md px-3 py-2 backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-1">
                  <h3 className="flex items-center gap-1.5 font-bold text-white text-[15px] leading-tight">
                    <Icon className="w-4 h-4 text-brand-muted" strokeWidth={2.25} aria-hidden="true" />
                    {t.name}
                  </h3>
                  <p className="text-white/65 text-xs">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ecommerce channels */}
        <div id="ecommerce" aria-labelledby="ecommerce-heading" className="scroll-mt-14" role="region">
          <SectionHeader
            dark
            id="ecommerce-heading"
            fkey="F5"
            eyebrow={d?.ecommerceBadge || 'OMNI-CHANNEL'}
            title={d?.ecommerceHeading || 'Connect your online store'}
            desc={d?.ecommerceDesc || 'Bridge your POS with Shopify or WooCommerce: sync catalog and inventory, import paid web orders, and push stock updates.'}
          />
          <div className="grid sm:grid-cols-2 gap-2 mb-2">
            {channels.map(({ Icon, ...c }, i) => (
              <div key={c.title} className="mk-reveal mk-glass mk-sheen rounded-lg p-4" style={{ ['--i' as string]: i }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4.5 h-4.5 text-brand-muted" strokeWidth={2.25} aria-hidden="true" />
                  <h3 className="font-bold text-[15px]">{c.title}</h3>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
          <ul className="grid gap-1.5">
            {capabilities.map(({ Icon, ...c }, i) => (
              <li key={c.title} className="mk-reveal group flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors" style={{ ['--i' as string]: i }}>
                <span className="mk-key w-8 h-8 rounded flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Icon className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{c.title}</h4>
                  <p className="text-xs text-white/55 leading-snug">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
