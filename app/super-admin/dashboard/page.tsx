'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ClipboardList, CreditCard, ScrollText, Settings } from 'lucide-react';
import { LedStat, SaPage, Slip, Printing } from '@/components/super-admin/ui';

interface Stats {
  totalTenants: number;
  activeTenants: number;
  inactiveTenants: number;
  totalUsers: number;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/stats', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const activePct = stats && stats.totalTenants > 0 ? Math.round((stats.activeTenants / stats.totalTenants) * 100) : null;

  const STAT_CARDS = stats
    ? [
        { label: 'Total tenants', value: stats.totalTenants, href: '/super-admin/tenants', sub: 'Across the platform', tone: 'default' as const },
        { label: 'Active tenants', value: stats.activeTenants, href: '/super-admin/tenants?active=true', sub: activePct !== null ? `${activePct}% of total` : 'No tenants yet', tone: 'default' as const },
        { label: 'Inactive tenants', value: stats.inactiveTenants, href: '/super-admin/tenants?active=false', sub: 'Suspended or disabled', tone: stats.inactiveTenants > 0 ? ('warn' as const) : ('default' as const) },
        { label: 'Total users', value: stats.totalUsers, href: null, sub: 'All roles, all tenants', tone: 'default' as const },
      ]
    : [];

  const QUICK_LINKS = [
    { label: 'Manage tenants', desc: 'Create, edit, activate or deactivate tenants', href: '/super-admin/tenants', Icon: Building2 },
    { label: 'Subscriptions', desc: 'Assign plans, extend trials, cancel subscriptions', href: '/super-admin/subscriptions', Icon: CreditCard },
    { label: 'Plans', desc: 'Create and manage subscription plan tiers', href: '/super-admin/plans', Icon: ClipboardList },
    { label: 'Audit logs', desc: 'Browse cross-tenant activity logs', href: '/super-admin/logs', Icon: ScrollText },
    { label: 'Settings', desc: 'Database health check and seed data tools', href: '/super-admin/settings', Icon: Settings },
  ];

  return (
    <SaPage tagNo="01" tag="Platform reading" title="Dashboard" subtitle="Where every store stands right now, and the keys you reach for most.">
      <section aria-label="Platform totals" aria-busy={loading} className="mt-8">
        {loading ? (
          <div className="border border-white/10 bg-black/30">
            <Printing dark label="Reading the counters…" />
          </div>
        ) : !stats ? (
          <p className="border-l-4 border-stamp bg-paper-white px-4 py-3 font-receipt text-sm text-ink">
            The counters didn’t load. Reload the page to try again.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STAT_CARDS.map(stat => {
              const tile = <LedStat label={stat.label} value={stat.value.toLocaleString()} note={stat.sub} tone={stat.tone} />;
              return stat.href ? (
                <Link key={stat.label} href={stat.href} className="block transition-colors hover:[&>div]:border-[#8fe3d0]/60">
                  {tile}
                </Link>
              ) : (
                <div key={stat.label}>{tile}</div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <Slip title="Quick access" tear className="lg:col-span-7">
          <ol className="divide-y divide-dashed divide-ink/20">
            {QUICK_LINKS.map((link, i) => (
              <li key={link.href}>
                <Link href={link.href} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-paper sm:px-5">
                  <span className="w-6 font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                  <link.Icon className="h-5 w-5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{link.label}</span>
                    <span className="mt-0.5 block text-sm text-ink/60">{link.desc}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink/40 transition-colors group-hover:text-ink" strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </Slip>

        <aside className="lg:col-span-5">
          <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/50">Read before you act</p>
          <ul className="mt-3 space-y-3 border-l border-dashed border-white/20 pl-4 text-sm text-paper/75">
            <li>Changes here reach every store at once. A plan or setting edit applies across tenants.</li>
            <li>Changes to tenants, subscriptions, billing and coupons are written to the admin action log.</li>
            <li>Deactivating a tenant stops its staff from signing in until you turn it back on.</li>
          </ul>
        </aside>
      </div>
    </SaPage>
  );
}
