'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Stats {
  totalTenants: number;
  activeTenants: number;
  inactiveTenants: number;
  totalUsers: number;
}

const STAT_COLOR: Record<string, string> = {
  blue: 'text-brand',
  green: 'text-green-600',
  red: 'text-red-600',
  purple: 'text-purple-600',
};

function IconTenants() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V7l9-4 9 4v14M9 21v-6h6v6" />
    </svg>
  );
}
function IconSubscriptions() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M2 10h20" />
    </svg>
  );
}
function IconPlans() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4" />
    </svg>
  );
}
function IconAuditLogs() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
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
        { label: 'Total Tenants', value: stats.totalTenants, color: 'blue', href: '/super-admin/tenants', sub: 'across the platform' },
        { label: 'Active Tenants', value: stats.activeTenants, color: 'green', href: '/super-admin/tenants?active=true', sub: activePct !== null ? `${activePct}% of total` : undefined },
        { label: 'Inactive Tenants', value: stats.inactiveTenants, color: 'red', href: '/super-admin/tenants?active=false', sub: 'suspended or disabled' },
        { label: 'Total Users', value: stats.totalUsers, color: 'purple', href: null, sub: 'all roles, all tenants' },
      ]
    : [];

  const QUICK_LINKS = [
    { label: 'Manage Tenants', desc: 'Create, edit, activate or deactivate tenants', href: '/super-admin/tenants', Icon: IconTenants },
    { label: 'Subscriptions', desc: 'Assign plans, extend trials, cancel subscriptions', href: '/super-admin/subscriptions', Icon: IconSubscriptions },
    { label: 'Plans', desc: 'Create and manage subscription plan tiers', href: '/super-admin/plans', Icon: IconPlans },
    { label: 'Audit Logs', desc: 'Browse cross-tenant activity logs', href: '/super-admin/logs', Icon: IconAuditLogs },
    { label: 'Settings', desc: 'Database health check and seed data tools', href: '/super-admin/settings', Icon: IconSettings },
  ];

  return (
      <div className="p-6 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Platform overview and quick access</p>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 p-5 animate-pulse">
                <div className="h-3 bg-gray-200 w-24 mb-3" />
                <div className="h-8 bg-gray-200 w-16 mb-2" />
                <div className="h-3 bg-gray-200 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {STAT_CARDS.map(stat => {
              const card = (
                <div key={stat.label} className={`bg-white border border-gray-200 p-5 h-full ${stat.href ? 'transition-colors group-hover:border-gray-300' : ''}`}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{stat.label}</p>
                  <p className={`text-3xl font-bold mt-1.5 tabular-nums ${STAT_COLOR[stat.color]}`}>{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
                </div>
              );
              return stat.href ? (
                <Link key={stat.label} href={stat.href} className="group block focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-1">
                  {card}
                </Link>
              ) : (
                card
              );
            })}
          </div>
        )}

        {/* Quick links */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white border border-gray-200 p-5 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-1 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center">
                  <link.Icon />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-brand">{link.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-snug">{link.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
  );
}
