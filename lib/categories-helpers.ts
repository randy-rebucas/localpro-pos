export function getStatusLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.active || 'Active') : (dict?.admin?.inactive || 'Inactive');
}

export function getActionButtonLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.deactivate || 'Deactivate') : (dict?.admin?.activate || 'Activate');
}

export function getStatusChangeMessage(isActivated: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActivated
    ? (dict?.admin?.categoryActivated || 'Category activated')
    : (dict?.admin?.categoryDeactivated || 'Category deactivated');
}

export function getStatusChangeErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.failedToUpdateCategory || 'Failed to update category';
}
