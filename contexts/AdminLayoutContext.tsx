'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface AdminLayoutContextValue {
  inAdminLayout: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleCollapse: () => void;
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null);

export function AdminLayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleMobileSidebar = useCallback(() => setSidebarOpen(o => !o), []);
  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleCollapse = useCallback(() => setSidebarCollapsed(c => !c), []);

  return (
    <AdminLayoutContext.Provider value={{ inAdminLayout: true, sidebarOpen, sidebarCollapsed, toggleMobileSidebar, closeMobileSidebar, toggleCollapse }}>
      {children}
    </AdminLayoutContext.Provider>
  );
}

export function useAdminLayout(): AdminLayoutContextValue {
  const ctx = useContext(AdminLayoutContext);
  if (!ctx) {
    return { inAdminLayout: false, sidebarOpen: false, sidebarCollapsed: false, toggleMobileSidebar: () => {}, closeMobileSidebar: () => {}, toggleCollapse: () => {} };
  }
  return ctx;
}
