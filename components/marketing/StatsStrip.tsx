import type { LucideIcon } from 'lucide-react';
import { Activity, Headset, ReceiptText, Store } from 'lucide-react';
import type { HomeDict, PlatformStats } from './useMarketing';
import { UPTIME_SLA_TARGET_PERCENT } from '@/lib/marketing-constants';
import { formatActiveTenants, formatCompletedTransactions } from '@/lib/marketing-format';

/** Live platform numbers in a single register-style readout bar under the hero. */
export default function StatsStrip({ d, stats }: { d: HomeDict; stats: PlatformStats }) {
  const live = stats !== 'loading' && stats !== 'failed' ? stats : null;
  const placeholder = stats === 'loading' ? '…' : '—';

  const items: { Icon: LucideIcon; value: string; label: string; desc: string }[] = [
    {
      Icon: Store,
      value: live ? formatActiveTenants(live.activeTenants) : placeholder,
      label: d?.spActiveStores || 'Active stores',
      desc:
        live && live.activeTenants === 0
          ? d?.spActiveStoresDescZero || 'No tenants in your connected database yet — create one from Sign up to appear here and on Browse Stores.'
          : d?.spActiveStoresDesc || 'Active stores in your connected database (same rule as Browse Stores)',
    },
    {
      Icon: ReceiptText,
      value: live ? formatCompletedTransactions(live.completedTransactions) : placeholder,
      label: d?.spTransactions || 'Transactions',
      desc: d?.spTransactionsDesc || 'completed sales recorded in-app (all tenants)',
    },
    {
      Icon: Activity,
      value: UPTIME_SLA_TARGET_PERCENT,
      label: d?.spUptimeSla || 'Uptime SLA',
      desc: d?.spUptimeSlaDesc || 'target monthly availability (managed production)',
    },
    { Icon: Headset, value: '24/7', label: d?.spSupport || 'Support', desc: d?.spSupportDesc || 'whenever you need us' },
  ];

  return (
    <section aria-label="Platform statistics" className="relative bg-[#0a1620] border-y border-white/10 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2.5">
          <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          {d?.trustedBy || 'Live on the platform right now'}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
          {items.map(({ Icon, ...s }, i) => (
            <div key={s.label} className="mk-reveal mk-glass rounded-md px-3.5 py-2.5 flex items-center gap-3 min-w-0" style={{ ['--i' as string]: i }}>
              <div key={s.value} className="mk-lcd mk-lcd-on rounded px-2 py-1 text-lg font-bold leading-none flex-shrink-0 min-w-16 text-center">{s.value}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white leading-tight">
                  <Icon className="w-3.5 h-3.5 text-brand-muted" strokeWidth={2.25} aria-hidden="true" />
                  {s.label}
                </div>
                <div className="text-[11px] text-white/45 leading-snug line-clamp-2">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
