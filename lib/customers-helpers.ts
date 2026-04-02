type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusBadgeClass(isActive: boolean): string {
  return isActive
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-red-100 text-red-800 border-red-300';
}

export function getStatusLabel(isActive: boolean, dict: Dict): string {
  return isActive ? (dict?.common?.active || 'Active') : (dict?.common?.inactive || 'Inactive');
}

export function getDeleteConfirmMessage(dict: Dict): string {
  return dict?.admin?.deleteCustomerConfirm || 'Are you sure you want to deactivate this customer?';
}

export function getDeleteSuccessMessage(dict: Dict): string {
  return dict?.admin?.customerDeactivated || 'Customer deactivated';
}

export function getDeleteErrorMessage(dict: Dict): string {
  return dict?.admin?.deleteCustomerError || 'Failed to deactivate customer';
}

export function getSaveSuccessMessage(isEdit: boolean, dict: Dict): string {
  if (isEdit) {
    return dict?.admin?.customerUpdated || 'Customer updated successfully';
  }
  return dict?.admin?.customerCreated || 'Customer created successfully';
}

export function getSaveErrorMessage(dict: Dict): string {
  return dict?.admin?.saveCustomerError || 'Failed to save customer';
}

export function getToggleStatusMessage(isActive: boolean, dict: Dict): string {
  return isActive
    ? (dict?.admin?.customerActivated || 'Customer activated')
    : (dict?.admin?.customerDeactivated || 'Customer deactivated');
}

export function formatCurrency(amount: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'es' ? 'es' : 'en', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

export function formatTags(tags: string[]) {
  if (!tags || tags.length === 0) return [];
  return tags.slice(0, 3).map(tag => ({ tag, display: tag }));
}
