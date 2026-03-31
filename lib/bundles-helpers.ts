/**
 * Bundle Management Utilities
 * Helper functions for status formatting, confirmations, and UI helpers
 */

/**
 * Get CSS classes for status badge
 */
export function getStatusColor(isActive: boolean): string {
  return isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300';
}

/**
 * Get status label text
 */
export function getStatusLabel(isActive: boolean, dict?: Record<string, Record<string, string>>): string {
  return isActive ? dict?.admin?.active || 'Active' : dict?.admin?.inactive || 'Inactive';
}

/**
 * Get delete confirmation message
 */
export function getDeleteConfirmMessage(dict?: Record<string, Record<string, string>>): string {
  return dict?.admin?.deleteBundleConfirm || 'Are you sure you want to delete this bundle?';
}

/**
 * Get bulk action confirmation message
 */
export function getBulkActionConfirmMessage(
  action: 'activate' | 'deactivate',
  count: number,
  dict?: Record<string, Record<string, string>>
): string {
  const defaultMsg = `Are you sure you want to ${action} ${count} bundle(s)?`;
  return (
    dict?.common?.bulkActionBundleConfirm
      ?.replace('{action}', action)
      .replace('{count}', count.toString()) || defaultMsg
  );
}

/**
 * Get category name safely
 */
export function getCategoryName(
  categoryId?:
    | string
    | {
        _id: string;
        name: string;
      }
): string {
  if (!categoryId) return '-';
  if (typeof categoryId === 'object' && categoryId !== null) {
    return categoryId.name;
  }
  return '-';
}

/**
 * Calculate bundle total value from items
 */
export function calculateBundleValue(items: Array<{ quantity: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
