import { Quote } from 'lucide-react';
import { SectionHeader } from './ui';
import type { HomeDict } from './useMarketing';

function Initials({ name, brand }: { name: string; brand: boolean }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('');
  return (
    <span className={`${brand ? 'mk-key-brand' : 'mk-key'} w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0`} aria-hidden="true">
      {initials}
    </span>
  );
}

export default function Testimonials({ d }: { d: HomeDict }) {
  const testimonials = [
    { quote: d?.testimonial1Quote || '1pos transformed how we run our retail chain. The real-time inventory and multi-branch reporting paid for itself within the first month.', name: d?.testimonial1Name || 'Maria Santos', role: d?.testimonial1Role || 'Owner, Santos Retail Group' },
    { quote: d?.testimonial2Quote || 'The automated workflows alone save my team 3+ hours every day — reminders, stock alerts, and scheduled reports just run themselves.', name: d?.testimonial2Name || 'James Reyes', role: d?.testimonial2Role || 'Operations Manager, QuickMart Stores' },
    { quote: d?.testimonial3Quote || 'We replaced three separate tools with 1pos. Bookings, customer CRM, and POS all in one platform is an absolute game changer.', name: d?.testimonial3Name || 'Ana Cruz', role: d?.testimonial3Role || 'Director, Cruz Service Centers' },
  ];
  const [lead, ...rest] = testimonials;

  return (
    <section id="testimonials" aria-labelledby="testimonials-heading" className="scroll-mt-14 px-4 sm:px-6 py-12 md:py-16 bg-[#eef3f5]">
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          id="testimonials-heading"
          fkey="F6"
          eyebrow={d?.testimonialsBadge || 'CUSTOMER STORIES'}
          title={d?.testimonialsHeading || 'From behind the counter'}
          desc={d?.testimonialsDesc || 'Owners and managers on what changed after they switched.'}
        />
        <div className="grid lg:grid-cols-5 gap-2">
          {/* Featured quote */}
          <figure className="mk-reveal lg:col-span-3 relative overflow-hidden rounded-lg mk-dark text-white p-6 md:p-8 flex flex-col">
            <Quote className="absolute -top-3 -right-3 w-32 h-32 text-white/[0.04] rotate-180" strokeWidth={1.5} aria-hidden="true" />
            <Quote className="w-6 h-6 text-brand-muted mb-4" strokeWidth={2.25} aria-hidden="true" />
            <blockquote className="text-lg md:text-xl font-medium leading-snug tracking-tight flex-1 mb-6">
              <p>{lead.quote}</p>
            </blockquote>
            <figcaption className="flex items-center gap-2.5 pt-4 border-t border-white/10">
              <Initials name={lead.name} brand />
              <div className="leading-tight">
                <cite className="not-italic font-semibold text-[13px] block">{lead.name}</cite>
                <span className="text-[11px] text-white/50">{lead.role}</span>
              </div>
            </figcaption>
          </figure>

          <div className="lg:col-span-2 grid gap-2">
            {rest.map((t, i) => (
              <figure key={t.name} className="mk-reveal mk-panel rounded-lg p-4 flex flex-col" style={{ ['--i' as string]: i + 1 }}>
                <blockquote className="text-sm text-gray-700 leading-relaxed flex-1 mb-3">
                  <p>
                    <Quote className="inline w-3.5 h-3.5 mr-1 -mt-1 text-brand" strokeWidth={2.5} aria-hidden="true" />
                    {t.quote}
                  </p>
                </blockquote>
                <figcaption className="flex items-center gap-2.5 pt-3 border-t border-gray-200">
                  <Initials name={t.name} brand={false} />
                  <div className="leading-tight">
                    <cite className="not-italic font-semibold text-gray-900 text-[13px] block">{t.name}</cite>
                    <span className="text-[11px] text-gray-500">{t.role}</span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
