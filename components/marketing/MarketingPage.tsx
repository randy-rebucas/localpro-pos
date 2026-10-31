'use client';

import SiteNav from './SiteNav';
import Hero from './Hero';
import StatsStrip from './StatsStrip';
import CounterCarousel from './CounterCarousel';
import FeaturesSection from './FeaturesSection';
import WhySection from './WhySection';
import SolutionsSection from './SolutionsSection';
import Testimonials from './Testimonials';
import ClosingCta from './ClosingCta';
import SiteFooter from './SiteFooter';
import { useHomeDict, usePlatformStats } from './useMarketing';

/** Public homepage. Styling primitives (`mk-*`) live in app/globals.css. */
export default function MarketingPage() {
  const d = useHomeDict();
  const stats = usePlatformStats();

  return (
    <div className="mk-root min-h-screen bg-[#0a1620] overflow-x-hidden">
      <header>
        <SiteNav d={d} />
        <Hero d={d} />
      </header>
      <main id="main-content">
        <StatsStrip d={d} stats={stats} />
        <CounterCarousel d={d} />
        <FeaturesSection d={d} />
        <WhySection d={d} />
        <SolutionsSection d={d} />
        <Testimonials d={d} />
        <ClosingCta d={d} />
      </main>
      <SiteFooter d={d} />
    </div>
  );
}
