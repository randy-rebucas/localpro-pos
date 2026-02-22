'use client';

import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function Navbar() {
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
  let subscriptionStatus = null;
  try {
    const subscriptionContext = useSubscription();
    subscriptionStatus = subscriptionContext.subscriptionStatus;
  } catch (error) {
    // SubscriptionProvider not available, subscriptionStatus remains null
  }

  const primaryColor = settings?.primaryColor || '#2563eb';
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
    { href: `/${tenant}/${lang}/pos`, key: 'pos' },
    { href: `/${tenant}/${lang}/products`, key: 'products' },
    { href: `/${tenant}/${lang}/transactions`, key: 'transactions' },
    { href: `/${tenant}/${lang}/reports`, key: 'reports' },
  ];

  // Conditional navigation items based on feature flags
  const conditionalNavItems: Array<{ href: string; key: string; featureFlag?: string }> = [
    { href: `/${tenant}/${lang}/inventory`, key: 'inventory', featureFlag: 'enableInventory' },
    { href: `/${tenant}/${lang}/admin/bookings`, key: 'bookings', featureFlag: 'enableBookingScheduling' },
  ];

  // Filter navigation items based on feature flags
  const navItems = [
    ...baseNavItems,
    ...conditionalNavItems.filter(item => {
      if (!item.featureFlag) return true;
      if (!settings) return true; // Show by default if settings not loaded yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (settings as any)[item.featureFlag] !== false; // Show if enabled or undefined (default enabled)
    }),
  ];

  const handleLogout = async () => {
    await logout();
    router.push(`/${tenant}/${lang}/login`);
  };

  if (!dict) {
    return (
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="text-2xl font-bold text-blue-600">POS</div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav className="bg-white border-b border-gray-300 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Header */}
          <div className="flex justify-between items-center h-16">
            {/* Left: Menu Button + Logo */}
            <div className="flex items-center space-x-4">
              {/* Drawer Menu Button */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center justify-center p-2 border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors bg-white"
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
              <div className="flex-shrink-0 flex items-center">
                <Link 
                  href={`/${tenant}/${lang}`} 
                  className="flex items-center space-x-2 group"
                  aria-label="Home"
                >
                  <div 
                    className="text-2xl sm:text-3xl font-bold transition-colors"
                    style={{ color: primaryColor }}
                  >
                    {settings?.companyName || 'POS'}
                  </div>
                </Link>
              </div>
            </div>
          
          {/* Right Side Actions */}
          <div className="flex items-center space-x-4">
            {/* User Section with Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-50 transition-colors bg-white"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-gray-900 leading-tight">
                      {user.name}
                    </div>
                    <div className="text-xs text-gray-500 capitalize leading-tight">
                      {user.role}
                    </div>
                  </div>
                  <div 
                    className="w-10 h-10 flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ 
                      background: `linear-gradient(to bottom right, ${primaryColor}, ${primaryColor}dd)`,
                      boxShadow: `0 0 0 2px ${primaryColor}33`
                    }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* User Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 border border-gray-300 bg-white z-50">
                    <div className="py-1">
                      {/* User Info Header */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500 capitalize mt-0.5">{user.role}</div>
                      </div>

                      {/* Profile */}
                      <Link
                        href={`/${tenant}/${lang}/profile`}
                        onClick={() => setUserMenuOpen(false)}
                        className={`flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                          pathname.includes('/profile') ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                      >
                        <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {dict?.nav?.profile || 'Profile'}
                      </Link>

                      {/* Admin - Only show for admin users */}
                      {isAdmin && (
                        <Link
                          href={`/${tenant}/${lang}/admin`}
                          onClick={() => setUserMenuOpen(false)}
                          className={`flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                            pathname.includes('/admin') ? 'bg-blue-50 text-blue-700' : ''
                          }`}
                        >
                          <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          {dict?.nav?.admin || 'Admin'}
                        </Link>
                      )}

                      {/* Settings */}
                      <Link
                        href={`/${tenant}/${lang}/settings`}
                        onClick={() => setUserMenuOpen(false)}
                        className={`flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                          pathname.includes('/settings') ? 'bg-blue-50 text-blue-700' : ''
                        }`}
                      >
                        <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {dict?.nav?.settings || 'Settings'}
                      </Link>

                      {/* Switch Store */}
                      <Link
                        href="/login"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {dict?.common?.switchStore || 'Switch Store'}
                      </Link>

                      {/* Divider */}
                      <div className="border-t border-gray-100 my-1" />

                      {/* Logout */}
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center px-4 py-2.5 text-sm text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-5 h-5 mr-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-3 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
                >
                  {dict?.common?.login || 'Login'}
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-3 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
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
          className="fixed inset-0 bg-white/30 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white border-r border-gray-300 z-50 transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div 
              className="text-xl font-bold"
              style={{ color: primaryColor }}
            >
              {settings?.companyName || 'POS'}
            </div>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors bg-white"
              aria-label={dict?.common?.closeMenu || 'Close menu'}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto">
            {/* User Section */}
            {isAuthenticated && user && (
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-12 h-12 border border-gray-300 flex items-center justify-center text-white font-bold"
                    style={{ 
                      background: `linear-gradient(to bottom right, ${primaryColor}, ${primaryColor}dd)`
                    }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{user.role}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Items */}
            <div className="p-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== `/${tenant}/${lang}` && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center px-4 py-3 border border-gray-300 text-base font-medium transition-all mb-1 ${
                      isActive
                        ? 'text-white border-gray-300'
                        : 'text-gray-700 hover:bg-gray-100 bg-white'
                    }`}
                    style={isActive ? { backgroundColor: primaryColor } : {}}
                  >
                    {dict?.nav?.[item.key] || item.key.charAt(0).toUpperCase() + item.key.slice(1)}
                  </Link>
                );
              })}
            </div>

            {/* User Menu Items */}
            {isAuthenticated && user && (
              <>
                <div className="border-t border-gray-200 my-2" />
                <div className="p-2 space-y-1">
                  <Link
                    href={`/${tenant}/${lang}/profile`}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center px-4 py-3 border border-gray-300 text-base font-medium transition-colors ${
                      pathname.includes('/profile')
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 bg-white'
                    }`}
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {dict?.nav?.profile || 'Profile'}
                  </Link>
                  {isAdmin && (
                    <Link
                      href={`/${tenant}/${lang}/admin`}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center px-4 py-3 border border-gray-300 text-base font-medium transition-colors ${
                        pathname.includes('/admin')
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : 'text-gray-700 hover:bg-gray-100 bg-white'
                      }`}
                    >
                      <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      {dict?.nav?.admin || 'Admin'}
                    </Link>
                  )}
                  <Link
                    href={`/${tenant}/${lang}/settings`}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center px-4 py-3 border border-gray-300 text-base font-medium transition-colors ${
                      pathname.includes('/settings')
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 bg-white'
                    }`}
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {dict?.nav?.settings || 'Settings'}
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center px-4 py-3 border border-gray-300 text-base font-medium text-gray-700 hover:bg-gray-100 transition-colors bg-white"
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    {dict?.common?.switchStore || 'Switch Store'}
                  </Link>
                </div>

                {/* Subscription Details - Only show if subscription context is available */}
                {subscriptionStatus && (
                  <>
                    <div className="border-t border-gray-200 my-2" />
                    <div className="p-2">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {dict?.common?.subscription || 'Subscription'}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            subscriptionStatus.isActive
                              ? 'bg-green-100 text-green-800'
                              : subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {subscriptionStatus.isActive
                              ? dict?.common?.active || 'Active'
                              : subscriptionStatus.isTrial && !subscriptionStatus.isTrialExpired
                              ? dict?.common?.trial || 'Trial'
                              : dict?.common?.expired || 'Expired'
                            }
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <div className="font-medium">{subscriptionStatus.planName}</div>
                          {subscriptionStatus.isTrial && subscriptionStatus.trialEndDate && (
                            <div className="text-xs mt-1">
                              {subscriptionStatus.isTrialExpired
                                ? (dict?.common?.trialExpired || 'Trial expired')
                                : `${Math.ceil((new Date(subscriptionStatus.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} ${dict?.common?.daysLeft || 'days left'}`
                              }
                            </div>
                          )}
                          {subscriptionStatus.nextBillingDate && !subscriptionStatus.isTrial && (
                            <div className="text-xs mt-1">
                              {dict?.common?.nextBilling || 'Next billing'}: {new Date(subscriptionStatus.nextBillingDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        {isAdmin && (
                          <Link
                            href={`/${tenant}/${lang}/admin/subscriptions`}
                            onClick={() => setDrawerOpen(false)}
                            className="mt-2 block w-full text-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                          >
                            {dict?.common?.manageSubscription || 'Manage Subscription'}
                          </Link>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t border-gray-200 my-2" />
                <div className="p-2">
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center w-full px-4 py-3 border border-red-300 text-base font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {dict?.common?.logout || 'Logout'}
                  </button>
                </div>
              </>
            )}

            {/* Login/Switch Store for non-authenticated users */}
            {!isAuthenticated && (
              <>
                <div className="border-t border-gray-200 my-2" />
                <div className="p-2 space-y-2">
                  <Link
                    href={`/${tenant}/${lang}/login`}
                    onClick={() => setDrawerOpen(false)}
                    className="block w-full px-4 py-3 text-center text-base font-medium text-white border border-gray-300 transition-colors"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {dict?.common?.login || 'Login'}
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setDrawerOpen(false)}
                    className="block w-full px-4 py-3 text-center text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition-colors"
                  >
                    {dict?.common?.switchStore || 'Switch Store'}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
