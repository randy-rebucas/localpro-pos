'use client';

import React, { ReactNode } from 'react';

interface AdminPageTemplateProps {
  title: string;
  subtitle?: string;
  message?: {
    type: 'success' | 'error';
    text: string;
  } | null;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  }>;
  children: ReactNode;
  loading?: boolean;
  emptyStateMessage?: string;
}

export function AdminPageTemplate({
  title,
  subtitle,
  message,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  primaryAction,
  secondaryActions = [],
  children,
  loading = false,
  emptyStateMessage = 'No data available',
}: AdminPageTemplateProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Content */}
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
          </div>
        </div>

        {/* Message/Alert Area */}
        {message && (
          <div
            className={`mb-6 p-4 border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : 'bg-red-50 text-red-800 border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-white border border-gray-300 p-6">
          {/* Toolbar: Search & Actions */}
          {(onSearchChange || primaryAction || secondaryActions.length > 0) && (
            <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
              {/* Search Input */}
              {onSearchChange && (
                <div className="flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              )}

              {/* Action Buttons */}
              {(primaryAction || secondaryActions.length > 0) && (
                <div className="flex gap-2">
                  {secondaryActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={action.onClick}
                      className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium border border-gray-300 inline-flex items-center gap-2 transition-colors"
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                  {primaryAction && (
                    <button
                      onClick={primaryAction.onClick}
                      className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700 transition-colors"
                    >
                      {primaryAction.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">Loading...</p>
              </div>
            </div>
          ) : (
            /* Main Content */
            <div>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Table Component for use within AdminPageTemplate
 */
interface TableColumn {
  key: string;
  label: string;
  render?: (value: any, row: any) => ReactNode;
}

interface AdminTableProps {
  columns: TableColumn[];
  data: any[];
  emptyMessage?: string;
}

export function AdminTable({ columns, data, emptyMessage = 'No data found' }: AdminTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-gray-900">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Modal Component for use within Admin Pages
 */
interface AdminModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
  maxWidth?: string;
  error?: string;
  submitting?: boolean;
}

export function AdminModal({
  title,
  isOpen,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  children,
  maxWidth = 'max-w-2xl',
  error,
  submitting = false,
}: AdminModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white border border-gray-300 ${maxWidth} w-full max-h-[90vh] overflow-y-auto`}>
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>

          <form onSubmit={onSubmit} className="space-y-4">
            {children}

            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white transition-colors"
              >
                {cancelLabel}
              </button>
              {onSubmit && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700 transition-colors"
                >
                  {submitting ? 'Saving...' : submitLabel}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Form Field Component for consistent styling
 */
interface FormFieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  error?: string;
}

export function FormField({ label, required, children, error }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/**
 * Form Grid for 2-column layouts
 */
interface FormGridProps {
  children: ReactNode;
  columns?: number;
}

export function FormGrid({ children, columns = 2 }: FormGridProps) {
  const gridClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${gridClass} gap-4`}>
      {children}
    </div>
  );
}

/**
 * Button Group Component
 */
interface ButtonGroupProps {
  children: ReactNode;
  justify?: 'start' | 'center' | 'end';
}

export function ButtonGroup({ children, justify = 'end' }: ButtonGroupProps) {
  const justifyClass = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  }[justify];

  return (
    <div className={`flex gap-3 ${justifyClass} pt-4`}>
      {children}
    </div>
  );
}

/**
 * Info Box Component for contextual information
 */
interface InfoBoxProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}

export function InfoBox({ title, subtitle, icon }: InfoBoxProps) {
  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
      <p className="text-sm text-blue-900">
        {icon && <span className="mr-2">{icon}</span>}
        <strong>{title}:</strong> {subtitle}
      </p>
    </div>
  );
}

/**
 * Status Badge Component
 */
interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info';
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
      {label}
    </span>
  );
}
