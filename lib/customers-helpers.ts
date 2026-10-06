type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusBadgeClass(isActive: boolean): string {
  return isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white';
}

export function getStatusLabel(isActive: boolean, dict: Dict): string {
  return isActive ? (dict?.common?.active || 'Active') : (dict?.common?.inactive || 'Inactive');
}

export function getDeleteConfirmMessage(dict: Dict): string {
  return dict?.admin?.deleteCustomerConfirm || 'Are you sure you want to deactivate this customer?';
}

export function getDeactivateConfirmMessage(name: string, dict: Dict): string {
  const template = dict?.admin?.deactivateCustomerNamed;
  if (template) return template.replace('{name}', name);
  return `Deactivate customer "${name}"? You can reactivate them later.`;
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

export function getToggleStatusErrorMessage(dict: Dict): string {
  return dict?.admin?.toggleCustomerStatusError || 'Could not update customer status';
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
