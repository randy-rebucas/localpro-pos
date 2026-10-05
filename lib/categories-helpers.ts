export function getStatusBadgeClasses(isActive: boolean): string {
  return isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white';
}

export function getStatusLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.active || 'Active') : (dict?.admin?.inactive || 'Inactive');
}

export function getActionButtonColor(isActive: boolean): string {
  return isActive ? 'bg-win8-danger' : 'bg-win8-success';
}

export function getActionButtonLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.deactivate || 'Deactivate') : (dict?.admin?.activate || 'Activate');
}

export function getStatusChangeMessage(isActivated: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Whole-sentence keys so each language controls its own word order.
  const full = isActivated ? dict?.admin?.categoryActivatedSuccess : dict?.admin?.categoryDeactivatedSuccess;
  if (full) return full;
  const status = isActivated ? (dict?.admin?.activated || 'activated') : (dict?.admin?.deactivated || 'deactivated');
  const successfully = dict?.admin?.successfully || 'successfully';
  return `Category ${status} ${successfully}`;
}

export function getStatusChangeErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.failedToUpdateCategory || 'Failed to update category';
}
