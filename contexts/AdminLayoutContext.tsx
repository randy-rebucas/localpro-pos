'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

type NavT = (key: string, fallback: string) => string;

interface AdminLayoutContextValue {
  inAdminLayout: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleCollapse: () => void;
  /** Labels for the admin header and sidebar, from the `adminNav` dictionary section. */
  navT: NavT;
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null);

const fallbackT: NavT = (_key, fallback) => fallback;

export function AdminLayoutProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const lang = params?.lang === 'es' ? 'es' : 'en';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labels, setLabels] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDictionaryClient(lang)
      .then(dict => { if (!cancelled) setLabels(dict?.adminNav ?? null); })
      .catch(() => { /* English fallbacks stay in place */ });
    return () => { cancelled = true; };
  }, [lang]);

  const toggleMobileSidebar = useCallback(() => setSidebarOpen(o => !o), []);
  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setSidebarCollapsed(c => !c), []);
  const navT = useCallback<NavT>((key, fallback) => labels?.[key] || fallback, [labels]);

  return (
    <AdminLayoutContext.Provider value={{ inAdminLayout: true, sidebarOpen, sidebarCollapsed, toggleMobileSidebar, closeMobileSidebar, toggleCollapse, navT }}>
      {children}
    </AdminLayoutContext.Provider>
  );
}

export function useAdminLayout(): AdminLayoutContextValue {
  const ctx = useContext(AdminLayoutContext);
  if (!ctx) {
    return { inAdminLayout: false, sidebarOpen: false, sidebarCollapsed: false, toggleMobileSidebar: () => {}, closeMobileSidebar: () => {}, toggleCollapse: () => {}, navT: fallbackT };
  }
  return ctx;
}
