'use client';

import React, { ReactNode, useState } from 'react';

export interface TabConfig {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

interface TabPageTemplateProps {
  title: string;
  subtitle?: string;
  tabs: TabConfig[];
  defaultTab?: string;
  loading?: boolean;
  primaryColor?: string;
  children?: ReactNode; // For elements outside tabs (like ConfirmDialog)
}

export function TabPageTemplate({
  title,
  subtitle,
  tabs,
  defaultTab,
  loading = false,
  primaryColor = '#3b82f6',
  children,
}: TabPageTemplateProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');

  const activeTabConfig = tabs.find(t => t.id === activeTab);

  return (
    <div>
      {children}
      
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-600">{subtitle}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 bg-gray-100 border border-gray-300">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-all border-r border-gray-300 last:border-r-0 flex items-center justify-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-white border-b-2 text-gray-900'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              style={activeTab === tab.id ? { borderBottomColor: primaryColor, color: primaryColor } : {}}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="inline-block animate-spin h-8 w-8 rounded-full"
              style={{
                borderTop: `2px solid ${primaryColor}`,
                borderRight: `2px solid ${primaryColor}`,
                borderBottom: '2px solid transparent',
                borderLeft: `2px solid ${primaryColor}`,
              }}
            />
          </div>
        ) : (
          activeTabConfig && activeTabConfig.content
        )}
      </div>
    </div>
  );
}
