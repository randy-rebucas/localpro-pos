import type { Tenant } from '@/hooks/useTenantsList';

export function getTenantStatusColor(isActive: boolean): string {
  return isActive
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-red-100 text-red-800 border-red-300';
}

export function getTenantStatusLabel(
  isActive: boolean,
  t?: (key: string) => string
): string {
  const translate = t || ((key: string) => key);
  return isActive
    ? translate('admin.active') || 'Active'
    : translate('admin.inactive') || 'Inactive';
}

export function formatTenantName(tenant: Tenant | null): string {
  return tenant?.name || 'Unknown';
}

export function formatBusinessType(businessType: string | undefined): string {
  if (!businessType) return 'Not set';
  return businessType.charAt(0).toUpperCase() + businessType.slice(1).replace(/_/g, ' ');
}

export function formatCurrency(currency: string): string {
  return (currency || 'USD').toUpperCase();
}

export function formatLanguage(language: 'en' | 'es'): string {
  return language === 'es' ? 'Español' : 'English';
}

export function getTenantInitials(tenant: Tenant | null): string {
  if (!tenant?.name) return '?';
  return tenant.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function validateTenantForm(
  slug: string,
  name: string,
  currency: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!currency || currency.trim().length === 0) {
    errors.push('Currency is required');
  }

  if (currency.length > 3) {
    errors.push('Currency code must be 3 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
