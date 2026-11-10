'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  ClipboardList,
  CreditCard,
  Database,
  LayoutGrid,
  LineChart,
  Loader2,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  TicketPercent,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';

interface User {
  email: string;
  name?: string;
}

interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
}

/** The key panel, grouped like departments on a till. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Platform',
    items: [
      { label: 'Dashboard', href: '/super-admin/dashboard', Icon: LayoutGrid },
      { label: 'Tenants', href: '/super-admin/tenants', Icon: Building2 },
      { label: 'Users', href: '/super-admin/users', Icon: Users },
      { label: 'Business Types', href: '/super-admin/business-types', Icon: Tags },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Subscriptions', href: '/super-admin/subscriptions', Icon: CreditCard },
      { label: 'Plans', href: '/super-admin/plans', Icon: ClipboardList },
      { label: 'Coupons', href: '/super-admin/coupons', Icon: TicketPercent },
      { label: 'Billing', href: '/super-admin/billing', Icon: Receipt },
      { label: 'Analytics', href: '/super-admin/analytics', Icon: LineChart },
    ],
  },
  {
    title: 'Records',
    items: [
      { label: 'Audit Logs', href: '/super-admin/logs', Icon: ScrollText },
      { label: 'Admin Actions', href: '/super-admin/admin-logs', Icon: ShieldCheck },
      { label: 'Backups', href: '/super-admin/backups', Icon: Database },
      { label: 'Settings', href: '/super-admin/settings', Icon: Settings },
    ],
  },
];

/** Each key's printed line number, counted down the whole panel. */
const LINE_NO = new Map(NAV_GROUPS.flatMap(g => g.items).map((item, i) => [item.href, String(i + 1).padStart(2, '0')]));

// Cached across client-side navigations so the shell never blanks out to a
// spinner when it's re-rendered (only refetched once per full page load).
let cachedUser: User | null = null;

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(cachedUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (cachedUser) return;
    fetch('/api/super-admin/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.user) {
          router.replace('/super-admin/login');
        } else {
          cachedUser = data.user;
          setUser(data.user);
        }
      })
      .catch(() => router.replace('/super-admin/login'));
  }, [router]);

  const handleLogout = async () => {
    cachedUser = null;
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/super-admin/login');
  };

  if (!user) {
    return (
      <div className={`${marketingFontClasses} mk-root flex min-h-screen items-center justify-center bg-brand-navy-deep!`}>
        <p role="status" className="flex items-center gap-2 font-receipt text-sm text-paper/70">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
          Checking your key…
        </p>
      </div>
    );
  }

  return (
    <div className={`${marketingFontClasses} mk-root flex min-h-screen bg-brand-navy-deep! text-paper`}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-ink/70 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* Key panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-white/10 bg-ink transition-transform duration-200 motion-reduce:transition-none lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Super admin"
      >
        <div className="flex items-start justify-between gap-2 border-b border-dashed border-white/20 px-5 pb-3 pt-4">
          <Link href="/super-admin/dashboard" className="flex min-w-0 flex-col items-start" onClick={() => setSidebarOpen(false)}>
            <span className="font-display text-4xl font-extrabold uppercase leading-none text-paper-white">1pos</span>
            <span className="mt-1.5 font-receipt text-[11px] uppercase tracking-[0.18em] text-[#8fe3d0]">Super admin · head office</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="-mr-2 flex h-11 w-11 items-center justify-center text-white/60 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]">
          {NAV_GROUPS.map(group => (
            <div key={group.title} className="mb-3 last:mb-0">
              <p className="px-2 pb-1.5 font-receipt text-[11px] uppercase tracking-[0.18em] text-white/40">{group.title}</p>
              <ul>
                {group.items.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-[40px] items-center gap-3 px-2 font-receipt text-xs uppercase tracking-[0.08em] transition-colors ${
                          active ? 'bg-brand font-semibold text-ink' : 'text-paper/75 hover:bg-white/5 hover:text-paper-white'
                        }`}
                      >
                        <span className={`w-5 tabular-nums ${active ? 'text-ink/70' : 'text-white/35'}`}>{LINE_NO.get(item.href)}</span>
                        <item.Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-t border-dashed border-white/20 py-2 pl-5 pr-2">
          <div className="min-w-0 flex-1">
            <p className="font-receipt text-[11px] uppercase tracking-[0.14em] text-white/40">Signed in</p>
            <p className="truncate font-receipt text-xs text-paper/80" title={user.email}>{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-paper/70 transition-colors hover:bg-white/10 hover:text-paper-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-white/10 bg-ink px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-2 flex h-11 w-11 items-center justify-center text-paper/80 hover:text-paper-white"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </button>
          <span className="font-display text-2xl font-extrabold uppercase leading-none text-paper-white">1pos</span>
          <span className="font-receipt text-[11px] uppercase tracking-[0.18em] text-[#8fe3d0]">Super admin</span>
        </header>

        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
