type Dict = Record<string, Record<string, string | undefined> | undefined>;

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

export function getToggleStatusErrorMessage(dict: Dict): string {
  return dict?.admin?.toggleCustomerStatusError || 'Could not update customer status';
}
