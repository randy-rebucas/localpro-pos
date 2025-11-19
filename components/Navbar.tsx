'use client';

import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export default function Navbar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const tenant = (params?.tenant as string) || 'default';
  const lang = params?.lang as 'en' | 'es' || 'en';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dict, setDict] = useState<any>(null);
  const { user, logout, isAuthenticated } = useAuth();
  const { settings } = useTenantSettings();
  const primaryColor = settings?.primaryColor || '#2563eb';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

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

  const navItems = [
    { href: `/${tenant}/${lang}`, key: 'dashboard' },
    { href: `/${tenant}/${lang}/pos`, key: 'pos' },
    { href: `/${tenant}/${lang}/products`, key: 'products' },
    { href: `/${tenant}/${lang}/transactions`, key: 'transactions' },
    { href: `/${tenant}/${lang}/reports`, key: 'reports' },
  ];

  const switchLanguage = (newLang: 'en' | 'es') => {
    const currentPath = pathname.replace(`/${tenant}/${lang}`, '') || '/';
    router.push(`/${tenant}/${newLang}${currentPath}`);
  };

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
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Header */}
        <div className="flex justify-between items-center h-16">
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
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex lg:flex-1 lg:justify-center lg:ml-8">
            <div className="flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== `/${tenant}/${lang}` && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative inline-flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'text-white shadow-md'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    style={isActive ? { backgroundColor: primaryColor } : {}}
                  >
                    {dict.nav[item.key]}
                  </Link>
                );
              })}
            </div>
          </div>
          
          {/* Right Side Actions - Desktop */}
          <div className="hidden lg:flex lg:items-center lg:space-x-4 lg:ml-auto">
            {/* Language Selector */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => switchLanguage('en')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  lang === 'en'
                    ? 'bg-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                style={lang === 'en' ? { color: primaryColor } : {}}
                aria-label="Switch to English"
              >
                EN
              </button>
              <button
                onClick={() => switchLanguage('es')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  lang === 'es'
                    ? 'bg-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                style={lang === 'es' ? { color: primaryColor } : {}}
                aria-label="Switch to Spanish"
              >
                ES
              </button>
            </div>

            {/* User Section with Dropdown */}
            {isAuthenticated && user ? (
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0"
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
                  <div className="absolute right-0 mt-2 w-56 rounded-lg shadow-lg bg-white z-50">
                    <div className="py-1">
                      {/* User Info Header */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500 capitalize mt-0.5">{user.role}</div>
                      </div>

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
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-3 py-2 rounded-md hover:bg-gray-50"
                >
                  {dict?.common?.login || 'Login'}
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-3 py-2 rounded-md hover:bg-gray-50"
                >
                  {dict?.common?.switchStore || 'Switch Store'}
                </Link>
              </div>
            )}
          </div>
          
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {/* Navigation Items */}
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== `/${tenant}/${lang}` && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 rounded-lg text-base font-medium transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {dict.nav[item.key]}
                </Link>
              );
            })}
            
            {/* Divider */}
            <div className="border-t border-gray-200 my-2" />
            
            {/* User Section - Mobile */}
            {isAuthenticated && user ? (
              <div className="px-4 py-3">
                <div className="flex items-center space-x-3 mb-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
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
                <div className="space-y-2">
                  <Link
                    href={`/${tenant}/${lang}/settings`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      pathname.includes('/settings')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 bg-gray-50 hover:bg-gray-100'
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
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    {dict?.common?.switchStore || 'Switch Store'}
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {dict?.common?.logout || 'Logout'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 space-y-2">
                <Link
                  href={`/${tenant}/${lang}/login`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  {dict?.common?.login || 'Login'}
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {dict?.common?.switchStore || 'Switch Store'}
                </Link>
              </div>
            )}
            
            {/* Language Selector - Mobile */}
            <div className="px-4 pt-2">
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => {
                    switchLanguage('en');
                    setMobileMenuOpen(false);
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-all ${
                    lang === 'en'
                      ? 'bg-white shadow-sm'
                      : 'text-gray-600'
                  }`}
                  style={lang === 'en' ? { color: primaryColor } : {}}
                >
                  English
                </button>
                <button
                  onClick={() => {
                    switchLanguage('es');
                    setMobileMenuOpen(false);
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-all ${
                    lang === 'es'
                      ? 'bg-white shadow-sm'
                      : 'text-gray-600'
                  }`}
                  style={lang === 'es' ? { color: primaryColor } : {}}
                >
                  Español
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
