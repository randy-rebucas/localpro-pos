'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface User {
  email: string;
  name?: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/super-admin/dashboard', icon: '▦' },
  { label: 'Tenants', href: '/super-admin/tenants', icon: '🏢' },
  { label: 'Subscriptions', href: '/super-admin/subscriptions', icon: '💳' },
  { label: 'Plans', href: '/super-admin/plans', icon: '📋' },
  { label: 'Analytics', href: '/super-admin/analytics', icon: '📊' },
  { label: 'Users', href: '/super-admin/users', icon: '👥' },
  { label: 'Business Types', href: '/super-admin/business-types', icon: '🏷️' },
  { label: 'Audit Logs', href: '/super-admin/logs', icon: '📜' },
  { label: 'Settings', href: '/super-admin/settings', icon: '⚙️' },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch('/api/super-admin/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.user) {
          router.replace('/super-admin/login');
        } else {
          setUser(data.user);
        }
      })
      .catch(() => router.replace('/super-admin/login'));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/super-admin/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-56 bg-gray-900 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              SA
            </div>
            <div>
              <p className="text-sm font-bold text-white">Super Admin</p>
              <p className="text-xs text-gray-400">1pos Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors ${
                  active
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="px-4 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-400 truncate mb-2">{user.email}</p>
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors py-1"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-900">Super Admin</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
