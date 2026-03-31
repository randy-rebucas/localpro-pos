export function getStatusBadgeClasses(isActive: boolean): string {
  if (isActive) {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  return 'bg-red-100 text-red-800 border-red-300';
}

export function getStatusLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.active || 'Active') : (dict?.admin?.inactive || 'Inactive');
}

export function getActionButtonColor(isActive: boolean): string {
  return isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900';
}

export function getActionButtonLabel(isActive: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return isActive ? (dict?.admin?.deactivate || 'Deactivate') : (dict?.admin?.activate || 'Activate');
}

export function getDeleteConfirmMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.deleteCategoryConfirm || dict?.admin?.deleteCategoryConfirm || 'Are you sure you want to delete this category?';
}

export function getDeleteSuccessMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.categoryDeletedSuccess || 'Category deleted successfully';
}

export function getDeleteErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.failedToDeleteCategory || 'Failed to delete category';
}

export function getStatusChangeMessage(isActivated: boolean, dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const status = isActivated ? (dict?.admin?.activated || 'activated') : (dict?.admin?.deactivated || 'deactivated');
  const successfully = dict?.admin?.successfully || 'successfully';
  return `Category ${status} ${successfully}`;
}

export function getStatusChangeErrorMessage(dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return dict?.common?.failedToUpdateCategory || 'Failed to update category';
}
