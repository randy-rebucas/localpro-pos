/**
 * User Management Utilities
 * Helper functions for role display, status formatting, and user actions
 */

export const USER_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'owner', label: 'Owner' },
] as const;

export type UserRole = typeof USER_ROLES[number]['value'];

/**
 * Get display name for a user role
 */
export function getRoleLabel(role: UserRole, dict?: any): string {
  const labels: Record<UserRole, string> = {
    viewer: dict?.admin?.viewer || 'Viewer',
    cashier: dict?.admin?.cashier || 'Cashier',
    manager: dict?.admin?.manager || 'Manager',
    admin: dict?.admin?.adminRole || 'Admin',
    owner: dict?.admin?.owner || 'Owner',
  };
  return labels[role] || role;
}

/**
 * Get CSS classes for status badge
 */
export function getStatusClasses(isActive: boolean): string {
  if (isActive) {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  return 'bg-red-100 text-red-800 border-red-300';
}

/**
 * Get status label text
 */
export function getStatusLabel(isActive: boolean, dict?: any): string {
  if (isActive) {
    return dict?.admin?.active || 'Active';
  }
  return dict?.admin?.inactive || 'Inactive';
}

/**
 * Get action label for toggle button
 */
export function getToggleActionLabel(isActive: boolean, dict?: any): string {
  if (isActive) {
    return dict?.admin?.deactivate || 'Deactivate';
  }
  return dict?.admin?.activate || 'Activate';
}

/**
 * Get toggle action button CSS classes
 */
export function getToggleActionClasses(isActive: boolean): string {
  if (isActive) {
    return 'text-orange-600 hover:text-orange-900';
  }
  return 'text-green-600 hover:text-green-900';
}

/**
 * Check if form has required fields
 */
export function hasCompleteUserForm(email: string, name: string, password: string, isEditMode: boolean): boolean {
  if (!email || !name) return false;
  if (!isEditMode && !password) return false;
  return true;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format date for display
 */
export function formatUserDate(dateString?: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Build delete confirmation message
 */
export function getDeleteConfirmMessage(dict?: any): { title: string; message: string } {
  return {
    title: dict?.common?.deleteUserConfirmTitle || 'Delete User',
    message: dict?.common?.deleteUserConfirm || 'Are you sure you want to delete this user?',
  };
}

/**
 * Build regenerate QR confirmation message
 */
export function getRegenerateQRConfirmMessage(dict?: any): { title: string; message: string } {
  return {
    title: dict?.common?.regenerateQRConfirmTitle || 'Regenerate QR Code',
    message:
      dict?.common?.regenerateQRConfirm ||
      dict?.admin?.regenerateQRConfirm ||
      'Are you sure you want to regenerate the QR code? The old QR code will no longer work.',
  };
}
