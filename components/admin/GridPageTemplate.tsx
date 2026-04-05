'use client';

import React, { ReactNode } from 'react';

interface GridPageTemplateProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children: ReactNode;
  columns?: number; // Default 3
  sidebar?: ReactNode;
  sidebarPosition?: 'left' | 'right'; // Default 'right'
  emptyStateMessage?: string;
}

export function GridPageTemplate({
  title,
  subtitle,
  loading = false,
  primaryAction,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
  columns = 3,
  sidebar,
  sidebarPosition = 'right',
  emptyStateMessage = 'No items available',
}: GridPageTemplateProps) {
  const sidebarWidth = sidebar ? 'lg:w-1/3' : '';
  const contentWidth = sidebar ? `lg:w-${sidebarPosition === 'right' ? '2' : ''}//3` : 'w-full';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {title}
              </h1>
              {subtitle && (
                <p className="text-gray-600">{subtitle}</p>
              )}
            </div>
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium rounded transition-colors"
              >
                {primaryAction.label}
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {onSearchChange && (
          <div className="mb-6">
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Main Content with Optional Sidebar */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-6 ${sidebar ? `lg:grid-cols-3` : ''}`}>
            {sidebarPosition === 'left' && sidebar && (
              <div className="lg:col-span-1">
                {sidebar}
              </div>
            )}

            <div className={sidebarPosition === 'left' && sidebar ? 'lg:col-span-2' : 'col-span-full'}>
              {children}
            </div>

            {sidebarPosition === 'right' && sidebar && (
              <div className="lg:col-span-1">
                {sidebar}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
