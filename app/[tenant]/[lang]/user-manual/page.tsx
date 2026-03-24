'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Navbar from '@/components/Navbar';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface DocIndex {
  files: string[];
  readme: string;
}

type DocFolder = 'user-manual' | 'tenant-manual' | 'bir-documentation';

const BIR_PLANS = ['Standard', 'Premium', 'Enterprise'];

// Section icons mapped by keyword
const SECTION_ICONS: Record<string, string> = {
  'getting-started': 'M13 10V3L4 14h7v7l9-11h-7z',
  'dashboard': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  'point-of-sale': 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z',
  'transactions': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  'products': 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  'inventory': 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  'bookings': 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  'customers': 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  'reports': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  'cash-drawer': 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  'attendance': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  'settings': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  'user-management': 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  'subscriptions': 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  'multi-branch': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  'bir': 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  'offline': 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0',
  'troubleshooting': 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  'role': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  'daily': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  // Tenant manual icons
  'tenant': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  'branding': 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
  'tax': 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  'notification': 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  'hardware': 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  'currency': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  'feature': 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  'automation': 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  'data': 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  'security': 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  'api': 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
};

function getIconForFile(filename: string): string {
  const name = filename.toLowerCase();
  for (const [key, path] of Object.entries(SECTION_ICONS)) {
    if (name.includes(key)) return path;
  }
  return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'; // default doc icon
}

function getChapterNumber(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '';
}

export default function UserManualPage() {
  const params = useParams();
  const lang = (params?.lang as string) || 'en';
  const { settings } = useTenantSettings();
  const primaryColor = settings?.primaryColor || '#2563eb';
  const { subscriptionStatus } = useSubscription();
  const hasBirAccess = BIR_PLANS.includes(subscriptionStatus?.planName ?? '');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dict, setDict] = useState<any>(null);
  const [activeFolder, setActiveFolder] = useState<DocFolder>('user-manual');
  const [index, setIndex] = useState<DocIndex | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const loadIndex = useCallback(async (folder: DocFolder) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docs?folder=${folder}`);
      if (!res.ok) throw new Error('Failed to load docs');
      const data: DocIndex = await res.json();
      setIndex(data);
      setContent(data.readme);
      setActiveFile(null);
      setSearchQuery('');
    } catch {
      setContent('# Error\n\nFailed to load documentation.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFile = useCallback(async (file: string) => {
    setLoading(true);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const res = await fetch(`/api/docs?folder=${activeFolder}&file=${file}`);
      if (!res.ok) throw new Error('Failed to load file');
      const data = await res.json();
      setContent(data.content);
      setActiveFile(file);
    } catch {
      setContent('# Error\n\nFailed to load this page.');
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    loadIndex(activeFolder);
  }, [activeFolder, loadIndex]);

  const formatFileName = (filename: string): string => {
    return filename
      .replace('.md', '')
      .replace(/^\d+-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const sidebarFiles = useMemo(() => {
    return index?.files.filter((f) => f !== 'README.md') || [];
  }, [index]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return sidebarFiles;
    const q = searchQuery.toLowerCase();
    return sidebarFiles.filter((f) => formatFileName(f).toLowerCase().includes(q));
  }, [sidebarFiles, searchQuery]);

  const folderLabel = activeFolder === 'user-manual'
    ? (dict?.nav?.userManual || 'User Manual')
    : activeFolder === 'bir-documentation'
    ? 'BIR Documentation'
    : (dict?.nav?.tenantManual || 'Tenant Manual');

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Title + Breadcrumb */}
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>{settings?.companyName || '1POS'}</span>
                <span>/</span>
                <span className="font-medium text-gray-700">{folderLabel}</span>
                {activeFile && (
                  <>
                    <span>/</span>
                    <span className="font-medium text-gray-700">{formatFileName(activeFile)}</span>
                  </>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {activeFile ? formatFileName(activeFile) : folderLabel}
              </h1>
              {!activeFile && (
                <p className="mt-1 text-sm text-gray-500">
                  {activeFolder === 'user-manual'
                    ? (dict?.common?.userManualDesc || 'Step-by-step guides for daily store operations')
                    : activeFolder === 'bir-documentation'
                    ? 'Bureau of Internal Revenue compliance, receipts, VAT, and audit trail guides'
                    : (dict?.common?.tenantManualDesc || 'Setup, configuration, and administration guides')
                  }
                </p>
              )}
            </div>

            {/* Folder Tabs */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300 bg-white self-start">
              <button
                onClick={() => setActiveFolder('user-manual')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeFolder !== 'user-manual' ? 'hover:bg-gray-50' : ''
                }`}
                style={
                  activeFolder === 'user-manual'
                    ? { backgroundColor: primaryColor, color: '#fff' }
                    : { color: '#374151' }
                }
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {dict?.nav?.userManual || 'User Manual'}
              </button>
              <button
                onClick={() => setActiveFolder('tenant-manual')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                  activeFolder !== 'tenant-manual' ? 'hover:bg-gray-50' : ''
                }`}
                style={
                  activeFolder === 'tenant-manual'
                    ? { backgroundColor: primaryColor, color: '#fff' }
                    : { color: '#374151' }
                }
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
                {dict?.nav?.tenantManual || 'Tenant Manual'}
              </button>
              {hasBirAccess && (
                <button
                  onClick={() => setActiveFolder('bir-documentation')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                    activeFolder !== 'bir-documentation' ? 'hover:bg-gray-50' : ''
                  }`}
                  style={
                    activeFolder === 'bir-documentation'
                      ? { backgroundColor: primaryColor, color: '#fff' }
                      : { color: '#374151' }
                  }
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                  BIR Docs
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Mobile Sidebar Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-shadow"
            style={{ backgroundColor: primaryColor }}
            aria-label="Toggle table of contents"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          {/* Sidebar */}
          <aside
            className={`
              fixed lg:static inset-0 z-30 lg:z-auto
              lg:w-72 lg:flex-shrink-0
              ${sidebarOpen ? 'block' : 'hidden lg:block'}
            `}
          >
            <div
              className="fixed inset-0 bg-black/30 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />

            <div className="fixed lg:static top-0 left-0 h-full w-80 max-w-[85vw] bg-white border border-gray-200 rounded-lg overflow-hidden z-40 lg:max-h-[calc(100vh-14rem)] lg:sticky lg:top-24 flex flex-col shadow-sm">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {dict?.common?.contents || 'Table of Contents'}
                  </h2>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={dict?.common?.search || 'Search pages...'}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-400"
                    style={{ ['--tw-ring-color' as string]: `${primaryColor}40` } as React.CSSProperties}
                  />
                </div>
              </div>

              {/* Scrollable nav */}
              <div className="flex-1 overflow-y-auto">
                {/* Home / Index */}
                <div className="px-2 pt-2">
                  <button
                    onClick={() => {
                      setActiveFile(null);
                      setContent(index?.readme || '');
                      setSidebarOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                      activeFile === null
                        ? 'text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    style={activeFile === null ? { backgroundColor: primaryColor } : {}}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    {dict?.common?.home || 'Overview'}
                  </button>
                </div>

                {/* Divider */}
                <div className="mx-4 my-2 border-t border-gray-100" />

                {/* Chapter list */}
                <nav className="px-2 pb-4 space-y-0.5">
                  {filteredFiles.map((file) => {
                    const isActive = activeFile === file;
                    const chapter = getChapterNumber(file);
                    const iconPath = getIconForFile(file);

                    return (
                      <button
                        key={file}
                        onClick={() => loadFile(file)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all group ${
                          isActive
                            ? 'text-white shadow-sm font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                        style={isActive ? { backgroundColor: primaryColor } : {}}
                      >
                        {/* Chapter number badge */}
                        {chapter && (
                          <span
                            className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                            }`}
                          >
                            {chapter}
                          </span>
                        )}
                        {!chapter && (
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                          </svg>
                        )}
                        <span className="truncate">{formatFileName(file)}</span>
                      </button>
                    );
                  })}

                  {filteredFiles.length === 0 && searchQuery && (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">
                      No pages match &quot;{searchQuery}&quot;
                    </div>
                  )}
                </nav>
              </div>

              {/* Footer with page count */}
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <div className="text-xs text-gray-400">
                  {sidebarFiles.length} {sidebarFiles.length === 1 ? 'chapter' : 'chapters'}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200" style={{ borderTopColor: primaryColor }} />
                  <span className="text-sm text-gray-400">{dict?.common?.loading || 'Loading...'}</span>
                </div>
              ) : (
                <>
                  {/* Chapter header with icon */}
                  {activeFile && (
                    <div className="px-6 sm:px-8 lg:px-10 pt-6 sm:pt-8 pb-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${primaryColor}12` }}
                        >
                          <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getIconForFile(activeFile)} />
                          </svg>
                        </div>
                        <div>
                          {getChapterNumber(activeFile) && (
                            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">
                              Chapter {getChapterNumber(activeFile)}
                            </div>
                          )}
                          <h2 className="text-lg font-bold text-gray-900">{formatFileName(activeFile)}</h2>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Markdown content */}
                  <div className="px-6 sm:px-8 lg:px-10 py-6 sm:py-8">
                    <article className="max-w-none text-base text-gray-700 leading-7">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          /* ── Headings ── */
                          h1: ({ children }) => (
                            <h1 className="text-2xl font-bold text-gray-900 pb-3 mb-6 border-b border-gray-200">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4 pb-2 border-b border-gray-100">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-lg font-bold text-gray-900 mt-8 mb-3">{children}</h3>
                          ),
                          h4: ({ children }) => (
                            <h4 className="text-base font-bold text-gray-800 mt-6 mb-2">{children}</h4>
                          ),

                          /* ── Paragraphs ── */
                          p: ({ children }) => (
                            <p className="text-gray-600 leading-7 mb-4">{children}</p>
                          ),

                          /* ── Links ── */
                          a: ({ href, children, ...props }) => {
                            if (href && href.startsWith('./') && href.endsWith('.md')) {
                              const linkedFile = href.replace('./', '');
                              return (
                                <button
                                  onClick={() => loadFile(linkedFile)}
                                  className="font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
                                  style={{ color: primaryColor }}
                                >
                                  {children}
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                </button>
                              );
                            }
                            if (href && href.startsWith('../')) {
                              const match = href.match(/^\.\.\/([^/]+)\/(.+\.md)$/);
                              if (match) {
                                const [, targetFolder, targetFile] = match;
                                if (targetFolder === 'user-manual' || targetFolder === 'tenant-manual') {
                                  return (
                                    <button
                                      onClick={() => {
                                        setActiveFolder(targetFolder as DocFolder);
                                        setTimeout(() => loadFile(targetFile), 200);
                                      }}
                                      className="font-medium hover:underline cursor-pointer"
                                      style={{ color: primaryColor }}
                                    >
                                      {children}
                                    </button>
                                  );
                                }
                              }
                            }
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: primaryColor }} {...props}>
                                {children}
                              </a>
                            );
                          },

                          /* ── Lists ── */
                          ul: ({ children }) => (
                            <ul className="list-disc pl-6 mb-4 space-y-1.5 text-gray-600 leading-7">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-6 mb-4 space-y-1.5 text-gray-600 leading-7">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-gray-600 leading-7 pl-1">{children}</li>
                          ),

                          /* ── Tables ── */
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-6 rounded-lg border border-gray-200">
                              <table className="min-w-full divide-y divide-gray-200">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-gray-50">{children}</thead>
                          ),
                          tbody: ({ children }) => (
                            <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>
                          ),
                          tr: ({ children, ...props }) => (
                            <tr className="even:bg-gray-50/50 hover:bg-gray-50 transition-colors" {...props}>{children}</tr>
                          ),
                          th: ({ children, ...props }) => (
                            <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200" {...props}>
                              {children}
                            </th>
                          ),
                          td: ({ children, ...props }) => (
                            <td className="px-4 py-2.5 text-sm text-gray-600 border-b border-gray-100" {...props}>
                              {children}
                            </td>
                          ),

                          /* ── Code ── */
                          pre: ({ children }) => (
                            <pre className="rounded-lg bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm leading-6 shadow-inner my-4 font-mono">
                              {children}
                            </pre>
                          ),
                          code: ({ children, className }) => {
                            // Inline code vs code block (code block is wrapped in pre)
                            const isBlock = className?.startsWith('language-');
                            if (isBlock) {
                              return <code className={`${className} font-mono`}>{children}</code>;
                            }
                            return (
                              <code className="text-sm bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-mono border border-gray-200">
                                {children}
                              </code>
                            );
                          },

                          /* ── Blockquotes (tips / warnings / notes) ── */
                          blockquote: ({ children }) => {
                            const text = String(children);
                            const isWarning = text.toLowerCase().includes('warning') || text.toLowerCase().includes('important');
                            const isTip = text.toLowerCase().includes('tip');
                            const isNote = text.toLowerCase().includes('note') || text.toLowerCase().includes('security');
                            const borderColor = isWarning ? '#f59e0b' : (isTip || isNote) ? primaryColor : '#d1d5db';
                            const bgColor = isWarning ? '#fffbeb' : (isTip || isNote) ? `${primaryColor}08` : '#f9fafb';
                            const icon = isWarning
                              ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z'
                              : (isTip || isNote)
                              ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                              : '';

                            return (
                              <blockquote
                                className="my-5 rounded-r-lg py-3 px-4 not-italic text-sm flex gap-3 items-start"
                                style={{ borderLeft: `4px solid ${borderColor}`, backgroundColor: bgColor }}
                              >
                                {icon && (
                                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: borderColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                                  </svg>
                                )}
                                <div>{children}</div>
                              </blockquote>
                            );
                          },

                          /* ── Horizontal rule ── */
                          hr: () => <hr className="border-gray-200 my-8" />,

                          /* ── Images ── */
                          img: ({ src, alt, ...props }) => (
                            // next/image requires known dimensions; markdown images are dynamic
                            <img src={src} alt={alt || ''} className="rounded-lg shadow-sm max-w-full h-auto my-4" {...props} /> // eslint-disable-line
                          ),

                          /* ── Strong / emphasis ── */
                          strong: ({ children }) => (
                            <strong className="font-semibold text-gray-900">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic text-gray-600">{children}</em>
                          ),

                          /* ── Checkboxes (task lists) ── */
                          input: ({ type, checked, ...props }) => {
                            if (type === 'checkbox') {
                              return (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  readOnly
                                  className="mr-2 rounded border-gray-300 cursor-default align-middle"
                                  style={{ accentColor: primaryColor }}
                                  {...props}
                                />
                              );
                            }
                            return <input type={type} {...props} />;
                          },

                          /* ── Strikethrough (GFM) ── */
                          del: ({ children }) => (
                            <del className="text-gray-400 line-through">{children}</del>
                          ),
                        }}
                      >
                        {content}
                      </ReactMarkdown>
                    </article>
                  </div>

                  {/* Prev / Next Navigation */}
                  {activeFile && sidebarFiles.length > 0 && (
                    <div className="px-6 sm:px-8 lg:px-10 py-5 border-t border-gray-100 bg-gray-50/50 rounded-b-lg">
                      {(() => {
                        const currentIdx = sidebarFiles.indexOf(activeFile);
                        const prevFile = currentIdx > 0 ? sidebarFiles[currentIdx - 1] : null;
                        const nextFile = currentIdx < sidebarFiles.length - 1 ? sidebarFiles[currentIdx + 1] : null;

                        return (
                          <div className="flex justify-between items-stretch gap-4">
                            {prevFile ? (
                              <button
                                onClick={() => loadFile(prevFile)}
                                className="flex-1 flex flex-col items-start p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-left group"
                              >
                                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                  </svg>
                                  Previous
                                </span>
                                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">
                                  {formatFileName(prevFile)}
                                </span>
                              </button>
                            ) : <div className="flex-1" />}
                            {nextFile ? (
                              <button
                                onClick={() => loadFile(nextFile)}
                                className="flex-1 flex flex-col items-end p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-right group"
                              >
                                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                                  Next
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </span>
                                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">
                                  {formatFileName(nextFile)}
                                </span>
                              </button>
                            ) : <div className="flex-1" />}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
