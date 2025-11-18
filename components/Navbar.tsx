'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';

export default function Navbar() {
  const pathname = usePathname();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = params?.lang as 'en' | 'es' || 'en';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dict, setDict] = useState<any>(null);
  const { user, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const navItems = [
    { href: `/${tenant}/${lang}`, key: 'dashboard' },
    { href: `/${tenant}/${lang}/pos`, key: 'pos' },
    { href: `/${tenant}/${lang}/products`, key: 'products' },
    { href: `/${tenant}/${lang}/transactions`, key: 'transactions' },
    { href: `/${tenant}/${lang}/settings`, key: 'settings' },
  ];

  const switchLanguage = (newLang: 'en' | 'es') => {
    const currentPath = pathname.replace(`/${tenant}/${lang}`, '') || '/';
    window.location.href = `/${tenant}/${newLang}${currentPath}`;
  };

  if (!dict) {
    return null;
  }

  return (
    <nav className="bg-white shadow-lg border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        {/* Mobile-first: Always show mobile layout, enhance for desktop */}
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo - Mobile optimized */}
          <div className="flex-shrink-0 flex items-center">
            <Link 
              href={`/${tenant}/${lang}`} 
              className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-600 hover:text-blue-700 active:opacity-80"
            >
              POS
            </Link>
          </div>
          
          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex md:flex-1 md:ml-6 md:space-x-1 lg:space-x-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center px-3 lg:px-4 py-2 border-b-2 text-sm lg:text-base font-medium transition-colors ${
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {dict.nav[item.key]}
              </Link>
            ))}
          </div>
          
                  {/* Desktop Actions - Hidden on mobile */}
                  <div className="hidden md:flex items-center gap-2">
                    {isAuthenticated && user ? (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100">
                          <div className="text-right">
                            <div className="text-xs font-medium text-gray-700">{user.name}</div>
                            <div className="text-xs text-gray-500 capitalize">{user.role}</div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <button
                          onClick={logout}
                          className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Logout
                        </button>
                      </>
                    ) : (
                      <Link
                        href={`/${tenant}/${lang}/login`}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Login
                      </Link>
                    )}
                    <Link
                      href="/login"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Switch Store
                    </Link>
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => switchLanguage('en')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  lang === 'en'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => switchLanguage('es')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  lang === 'es'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                ES
              </button>
            </div>
          </div>
          
          {/* Mobile menu button - Always visible on mobile */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center p-2.5 rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
      
      {/* Mobile menu - Full screen overlay style */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
          <div className="px-2 pt-2 pb-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3.5 rounded-xl text-base font-medium transition-all ${
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                {dict.nav[item.key]}
              </Link>
            ))}
            <div className="pt-3 mt-3 border-t border-gray-200 space-y-2">
              <div className="grid grid-cols-2 gap-2 px-1">
                <button
                  onClick={() => {
                    switchLanguage('en');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 rounded-xl text-base font-medium transition-all ${
                    lang === 'en'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => {
                    switchLanguage('es');
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 rounded-xl text-base font-medium transition-all ${
                    lang === 'es'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  Español
                </button>
              </div>
              {isAuthenticated && user ? (
                <>
                  <div className="px-4 py-3 bg-gray-50 rounded-xl mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{user.role}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full px-4 py-3.5 text-center text-base font-medium text-red-700 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-xl transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href={`/${tenant}/${lang}/login`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-4 py-3.5 text-center text-base font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-xl transition-colors"
                >
                  Login
                </Link>
              )}
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full px-4 py-3.5 text-center text-base font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 rounded-xl transition-colors"
              >
                Switch Store
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

