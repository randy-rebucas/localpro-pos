/**
 * Branch Management Utilities
 * Helper functions for status formatting, address formatting, and UI helpers
 */

export type BranchStatus = 'active' | 'inactive';

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
 * Format address string for display
 */
export function formatAddress(address?: {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}): string {
  if (!address) return '-';
  const parts = [address.street, address.city, address.state, address.zipCode, address.country].filter(
    (part) => part && part.trim()
  );
  return parts.length > 0 ? parts.join(', ') : '-';
}

/**
 * Get manager display name
 */
export function getManagerName(
  managerId?:
    | {
        _id: string;
        name: string;
        email: string;
      }
    | string
): string {
  if (!managerId) return '-';
  if (typeof managerId === 'object' && managerId !== null) {
    return managerId.name;
  }
  return '-';
}

/**
 * Get deactivate confirmation message
 */
export function getDeactivateConfirmMessage(dict?: Record<string, Record<string, string>>): string {
  return (
    dict?.common?.deactivateBranchConfirm ||
    dict?.admin?.deactivateBranchConfirm ||
    'Are you sure you want to deactivate this branch?'
  );
}

/**
 * Get delete confirmation message
 */
export function getDeleteConfirmMessage(dict?: Record<string, Record<string, string>>): string {
  return dict?.common?.deleteBranchConfirm || 'Are you sure you want to delete this branch?';
}
