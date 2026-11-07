'use client';

import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useSubscription } from '@/contexts/SubscriptionContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useAdminLayout } from '@/contexts/AdminLayoutContext';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';

/* Drawer rows read like a till's function list. */
const drawerRow = 'flex items-center gap-3 min-h-[48px] w-full px-3 py-2 font-receipt text-sm font-medium uppercase transition-colors';
const drawerTone = (active: boolean) => (active ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10');

export default function Navbar() {
  const { inAdminLayout } = useAdminLayout();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const tenant = (params?.tenant as string) || 'default';
  const lang = params?.lang as 'en' | 'es' || 'en';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { user, logout, isAuthenticated, hasRole } = useAuth();
  const { settings } = useTenantSettings();

  // Subscription context may not be available outside admin areas
  let subscriptionStatus: ReturnType<typeof useSubscription>['subscriptionStatus'] = null;
  try {
    const subscriptionContext = useSubscription();
    subscriptionStatus = subscriptionContext.subscriptionStatus;
  } catch {
    // SubscriptionProvider not available, subscriptionStatus remains null
  }

  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const isAdmin = user && (user.role === 'admin' || hasRole(['admin']));

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-user-menu]')) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  // Base navigation items available to all authenticated users
  const baseNavItems: Array<{ href: string; key: string; featureFlag?: string }> = [
    { href: `/${tenant}/${lang}`, key: 'dashboard' },
    { href: `/${tenant}/${lang}/products`, key: 'products' },
    { href: `/${tenant}/${lang}/transactions`, key: 'transactions' },
    { href: `/${tenant}/${lang}/reports`, key: 'reports' },
  ];

  // Conditional navigation items based on feature flags
  const conditionalNavItems: Array<{ href: string; key: string; featureFlag?: string }> = [
    { href: `/${tenant}/${lang}/inventory`, key: 'inventory', featureFlag: 'enableInventory' },
    { href: `/${tenant}/${lang}/admin/bookings`, key: 'bookings', featureFlag: 'enableBookingScheduling' },
    { href: `/${tenant}/${lang}/admin/crm`, key: 'crm', featureFlag: 'enableCustomerManagement' },
  ];

  // Filter navigation items based on feature flags
  const navItems = [
    ...baseNavItems,
    ...conditionalNavItems.filter((item) => {
      if (!item.featureFlag) return true;
      if (!settings) return true; // Show by default if settings not loaded yet
      if (
        subscriptionStatus &&
        !subscriptionStatus.features[item.featureFlag as keyof typeof subscriptionStatus.features]
      ) {
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (settings as any)[item.featureFlag] !== false;
    }),
  ];

  const handleLogout = async () => {
    await logout();
    router.push(`/${tenant}/${lang}/login`);
  };

  if (!dict) {
    return (
      <nav className={`${marketingFontClasses} bg-paper-white border-b-2 border-ink sticky top-0 z-50`}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="font-display text-3xl font-extrabold uppercase leading-none" style={{ color: primaryColor }}>POS</div>
          </div>
        </div>
      </nav>
    );
  }

  if (inAdminLayout) return null;

  return (
    <>
      <nav className={`${marketingFontClasses} bg-paper-white border-b-2 border-ink sticky top-0 z-50`}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          {/* Main Header */}
          <div className="flex justify-between items-center gap-3 h-16">
            {/* Left: Menu Button + Logo */}
            <div className="flex min-w-0 items-center space-x-4">
              {/* Drawer Menu Button */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="inline-flex flex-shrink-0 items-center justify-center p-2 border border-ink/25 text-ink hover:border-ink focus:outline-none focus:ring-2 focus:ring-inset transition-colors bg-paper-white"
                style={{ outlineColor: primaryColor }}
                onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`; e.currentTarget.style.borderColor = primaryColor; }}
                onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgb(16 32 43 / 0.25)'; }}
                aria-expanded={drawerOpen}
                aria-label={dict?.common?.openMenu || 'Open menu'}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo Section */}
              <div className="flex min-w-0 items-center">
                <Link
                  href={`/${tenant}/${lang}`}
                  className="flex min-w-0 items-center space-x-2 group"
                  aria-label="Home"
                >
                  <div
                    className="truncate font-display text-2xl sm:text-3xl font-extrabold uppercase leading-none"
                    style={{ color: primaryColor }}
                  >
                    {settings?.companyName || 'POS'}
                  </div>
                </Link>
              </div>
            </div>

          {/* Right Side Actions */}
          <div className="flex flex-shrink-0 items-center space-x-2 sm:space-x-3">
            {/* Language Switcher */}
            <LanguageSwitcher lang={lang} tenant={tenant} />

            <Link
              href={`/${tenant}/${lang}/user-manual`}
              className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 font-receipt text-xs font-medium uppercase border transition-colors ${
                pathname.includes('/user-manual')
                  ? 'bg-ink text-paper-white border-ink'
                  : 'text-ink border-ink/25 hover:border-ink bg-paper-white'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>{dict?.nav?.userManual || 'User Manual'}</span>
            </Link>

            {/* User Section with Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-1 sm:px-3 py-2 hover:bg-paper transition-colors bg-paper-white"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-ink leading-tight">
                      {user.name}
                    </div>
                    <div className="font-receipt text-[11px] uppercase text-ink/60 leading-tight">
                      {user.role}
                    </div>
                  </div>
                  <div 
                    className="w-10 h-10 flex items-center justify-center bg-ink text-paper-white font-receipt text-sm font-semibold flex-shrink-0"
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <svg
                    className={`hidden sm:block w-4 h-4 text-ink/60 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* User Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 border-2 border-ink bg-paper-white text-ink z-50">
                    <div className="py-1">
                      {/* User Info Header */}
                      <div className="px-4 py-3 border-b border-dashed border-ink/30">
                        <div className="text-sm font-semibold text-ink">{user.name}</div>
                        <div className="font-receipt text-[11px] uppercase text-ink/60 mt-0.5">{user.role}</div>
                      </div>

                      {/* Profile */}
                      <Link
                        href={`/${tenant}/${lang}/profile`}
                        onClick={() => setUserMenuOpen(false)}
                        className={`flex items-center px-4 py-2.5 text-sm transition-colors ${pathname.includes('/profile') ? 'bg-brand-soft text-ink font-semibold' : 'text-ink hover:bg-paper'}`}
                      >
                        <svg className="w-5 h-5 mr-3 text-ink/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {dict?.nav?.profile || 'Profile'}
                      </Link>

                      {/* Admin - Only show for admin users */}
                      {isAdmin && (
                        <Link
                          href={`/${tenant}/${lang}/admin`}
                          onClick={() => setUserMenuOpen(false)}
                          className={`flex items-center px-4 py-2.5 text-sm transition-colors ${pathname.includes('/admin') ? 'bg-brand-soft text-ink font-semibold' : 'text-ink hover:bg-paper'}`}
                        >
                          <svg className="w-5 h-5 mr-3 text-ink/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          {dict?.nav?.admin || 'Admin'}
                        </Link>
                      )}

                      {/* Settings */}
                      <Link
                        href={`/${tenant}/${lang}/settings`}
                        onClick={() => setUserMenuOpen(false)}
                        className={`flex items-center px-4 py-2.5 text-sm transition-colors ${pathname.includes('/settings') ? 'bg-brand-soft text-ink font-semibold' : 'text-ink hover:bg-paper'}`}
                      >
                        <svg className="w-5 h-5 mr-3 text-ink/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {dict?.nav?.settings || 'Settings'}
                      </Link>

                      {/* Switch Store */}
                      <Link
                        href="/login"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center px-4 py-2.5 text-sm text-ink/80 hover:bg-paper transition-colors"
                      >
                        <svg className="w-5 h-5 mr-3 text-ink/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {dict?.common?.switchStore || 'Switch Store'}
                      </Link>

                      {/* Divider */}
                      <div className="border-t border-dashed border-ink/30 my-1" />

                      {/* Logout */}
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center px-4 py-2.5 text-sm text-stamp hover:bg-paper transition-colors"
                      >
                        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {dict?.common?.logout || 'Logout'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href={`/${tenant}/${lang}/login`}
                  className="flex items-center font-receipt text-xs font-medium uppercase text-ink transition-colors px-3 py-2 border border-ink/25 hover:border-ink bg-paper-white"
                >
                  {dict?.common?.login || 'Login'}
                </Link>
                <Link
                  href="/login"
                  className="flex items-center font-receipt text-xs font-medium uppercase text-ink transition-colors px-3 py-2 border border-ink/25 hover:border-ink bg-paper-white"
                >
                  {dict?.common?.switchStore || 'Switch Store'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      </nav>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-ink/60 z-50 transition-opacity"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`${marketingFontClasses} fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-brand-navy-deep text-paper z-50 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Drawer Header */}
          <div className="flex items-center justify-between gap-3 p-4 border-b border-dashed border-white/20">
            <div className="truncate font-display text-3xl font-extrabold uppercase leading-none text-paper-white">
              {settings?.companyName || 'POS'}
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="flex-shrink-0 p-2 border border-white/25 text-paper hover:bg-white/10 transition-colors"
              aria-label={dict?.common?.closeMenu || 'Close menu'}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto">
            {/* User Section */}
            {isAuthenticated && user && (
              <div className="flex items-center gap-3 p-4 border-b border-dashed border-white/20">
                <div className="w-11 h-11 flex flex-shrink-0 items-center justify-center bg-paper-white font-receipt font-semibold text-ink">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-paper-white">{user.name}</div>
                  <div className="font-receipt text-[11px] uppercase text-[#8fe3d0]">{user.role}</div>
                </div>
              </div>
            )}

            {/* Navigation Items */}
            <div className="p-2 divide-y divide-dashed divide-white/15">
              {navItems.map((item, index) => {
                const isActive = pathname === item.href || (item.href !== `/${tenant}/${lang}` && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${drawerRow} ${drawerTone(isActive)}`}
                  >
                    <span className="w-6 text-xs font-normal opacity-60">{String(index + 1).padStart(2, '0')}</span>
                    {dict?.nav?.[item.key] || item.key.charAt(0).toUpperCase() + item.key.slice(1)}
                  </Link>
                );
              })}
            </div>

            {/* User Menu Items */}
            {isAuthenticated && user && (
              <>
                <div className="p-2 border-t border-dashed border-white/20 divide-y divide-dashed divide-white/15">
                  <Link
                    href={`/${tenant}/${lang}/profile`}
                    onClick={() => setDrawerOpen(false)}
                    className={`${drawerRow} ${drawerTone(pathname.includes('/profile'))}`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {dict?.nav?.profile || 'Profile'}
                  </Link>
                  {isAdmin && (
                    <Link
                      href={`/${tenant}/${lang}/admin`}
                      onClick={() => setDrawerOpen(false)}
                      className={`${drawerRow} ${drawerTone(pathname.includes('/admin'))}`}
                    >
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      {dict?.nav?.admin || 'Admin'}
                    </Link>
                  )}
                  <Link
                    href={`/${tenant}/${lang}/settings`}
                    onClick={() => setDrawerOpen(false)}
                    className={`${drawerRow} ${drawerTone(pathname.includes('/settings'))}`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {dict?.nav?.settings || 'Settings'}
                  </Link>
                  <Link
                    href={`/${tenant}/${lang}/user-manual`}
                    onClick={() => setDrawerOpen(false)}
                    className={`${drawerRow} ${drawerTone(pathname.includes('/user-manual'))} lg:hidden`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    {dict?.nav?.userManual || 'User Manual'}
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setDrawerOpen(false)}
                    className={`${drawerRow} ${drawerTone(false)}`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    {dict?.common?.switchStore || 'Switch Store'}
                  </Link>
                </div>

                {/* Subscription Details - Only show if subscription context is available */}
                {subscriptionStatus && (
                  <div className="px-3 pt-3">
                    <div className="bg-paper-white p-3 text-ink">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-receipt text-xs font-medium uppercase tracking-wide text-ink/70">
                          {dict?.common?.subscription || 'Subscription'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 font-receipt text-xs ${
                          subscriptionStatus.isActive
                            ? 'bg-brand-soft text-ink'
                            : subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired
                            ? 'border border-ink text-ink'
                            : 'bg-stamp text-paper-white'
                        }`}
                        >
                          {subscriptionStatus.isActive
                            ? dict?.common?.active || 'Active'
                            : subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired
                            ? dict?.common?.trial || 'Trial'
                            : dict?.common?.expired || 'Expired'
                          }
                        </span>
                      </div>
                      <div className="font-semibold text-sm text-ink mb-1">{subscriptionStatus.planName}</div>
                      {subscriptionStatus.isTrial && subscriptionStatus.trialEndDate && (
                        <div className="font-receipt text-xs text-ink/70">
                          {subscriptionStatus.isTrialExpired
                            ? (dict?.common?.trialExpired || 'Trial expired')
                            : `${Math.ceil((new Date(subscriptionStatus.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} ${dict?.common?.daysLeft || 'days left'}`
                          }
                        </div>
                      )}
                      {subscriptionStatus.nextBillingDate && !subscriptionStatus.isTrial && (
                        <div className="font-receipt text-xs text-ink/70">
                          {dict?.common?.nextBilling || 'Next billing'}: {new Date(subscriptionStatus.nextBillingDate).toLocaleDateString()}
                        </div>
                      )}
                      {isAdmin && (
                        <Link
                          href={`/${tenant}/${lang}/admin/subscriptions`}
                          onClick={() => setDrawerOpen(false)}
                          className="mt-3 flex items-center justify-between w-full px-3 py-1.5 bg-ink font-receipt text-xs font-medium uppercase text-paper-white hover:bg-brand-navy transition-colors"
                        >
                          <span>{dict?.common?.manageSubscription || 'Manage Subscription'}</span>
                          <svg className="w-3 h-3 ml-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>
                    <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                  </div>
                )}

                <div className="p-3">
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      handleLogout();
                    }}
                    className={`${drawerRow} border border-stamp text-paper hover:bg-stamp hover:text-paper-white`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {dict?.common?.logout || 'Logout'}
                  </button>
                </div>
              </>
            )}

            {/* Login/Switch Store for non-authenticated users */}
            {!isAuthenticated && (
              <div className="p-3 border-t border-dashed border-white/20 space-y-2">
                <Link
                  href={`/${tenant}/${lang}/login`}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center justify-center w-full px-4 py-3 bg-brand font-receipt text-sm font-medium uppercase text-ink hover:bg-brand-muted transition-colors"
                >
                  {dict?.common?.login || 'Login'}
                </Link>
                <Link
                  href="/login"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center justify-center w-full px-4 py-3 border border-white/25 font-receipt text-sm font-medium uppercase text-paper hover:bg-white/10 transition-colors"
                >
                  {dict?.common?.switchStore || 'Switch Store'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
