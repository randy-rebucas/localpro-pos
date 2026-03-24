'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { SuperAdminShell } from '@/components/super-admin/Shell';

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

  const STAT_CARDS = stats
    ? [
        { label: 'Total Tenants', value: stats.totalTenants, color: 'blue', href: '/super-admin/tenants' },
        { label: 'Active Tenants', value: stats.activeTenants, color: 'green', href: '/super-admin/tenants?active=true' },
        { label: 'Inactive Tenants', value: stats.inactiveTenants, color: 'red', href: '/super-admin/tenants?active=false' },
        { label: 'Total Users', value: stats.totalUsers, color: 'purple', href: null },
      ]
    : [];

  const QUICK_LINKS = [
    { label: 'Manage Tenants', desc: 'Create, edit, activate or deactivate tenants', href: '/super-admin/tenants', icon: '🏢' },
    { label: 'Subscriptions', desc: 'Assign plans, extend trials, cancel subscriptions', href: '/super-admin/subscriptions', icon: '💳' },
    { label: 'Plans', desc: 'Create and manage subscription plan tiers', href: '/super-admin/plans', icon: '📋' },
    { label: 'Audit Logs', desc: 'Browse cross-tenant activity logs', href: '/super-admin/logs', icon: '📜' },
    { label: 'Settings', desc: 'Database health check and seed data tools', href: '/super-admin/settings', icon: '⚙️' },
  ];

  return (
    <SuperAdminShell>
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
                <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-12" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {STAT_CARDS.map(stat => (
              <div key={stat.label} className="bg-white border border-gray-200 p-5">
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className={`text-3xl font-bold mt-1 text-${stat.color}-600`}>{stat.value}</p>
                {stat.href && (
                  <Link href={stat.href} className="text-xs text-blue-600 hover:underline mt-2 inline-block">
                    View →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{link.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600">{link.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{link.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SuperAdminShell>
  );
}
