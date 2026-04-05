'use client';

import React, { ReactNode } from 'react';

interface ChartPageTemplateProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  message?: {
    type: 'success' | 'error';
    text: string;
  } | null;
  filters?: ReactNode; // Filter controls row
  chart?: ReactNode; // Main chart component
  table?: ReactNode; // Optional table below chart
  children?: ReactNode; // Additional content
}

export function ChartPageTemplate({
  title,
  subtitle,
  loading = false,
  message,
  filters,
  chart,
  table,
  children,
}: ChartPageTemplateProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Section */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-600">{subtitle}</p>
          )}
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 border rounded ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Filters Section */}
            {filters && (
              <div className="mb-6 bg-white border border-gray-300 p-5 sm:p-6 rounded">
                {filters}
              </div>
            )}

            {/* Chart Section */}
            {chart && (
              <div className="mb-6 bg-white border border-gray-300 p-5 sm:p-6 rounded">
                {chart}
              </div>
            )}

            {/* Table Section */}
            {table && (
              <div className="bg-white border border-gray-300 p-5 sm:p-6 rounded">
                {table}
              </div>
            )}

            {/* Additional Content */}
            {children}
          </>
        )}
      </div>
    </div>
  );
}
