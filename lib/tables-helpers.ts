export function getStatusColor(status: 'open' | 'occupied' | 'check-requested'): string {
  switch (status) {
    case 'open':
      return 'bg-green-100 text-green-800';
    case 'occupied':
      return 'bg-blue-100 text-blue-800';
    case 'check-requested':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusLabel(
  status: 'open' | 'occupied' | 'check-requested',
  dict: Record<string, string>
): string {
  const key = `status.${status}`;
  const labels: Record<string, string> = {
    open: dict?.['status.open'] || 'Open',
    occupied: dict?.['status.occupied'] || 'Occupied',
    'check-requested': dict?.['status.check-requested'] || 'Check Requested',
  };
  return labels[status] || status;
}

export function getActiveStatusColor(isActive: boolean): string {
  return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
}

export function getActiveStatusLabel(isActive: boolean, dict: Record<string, string>): string {
  return isActive ? dict?.['common.active'] || 'Active' : dict?.['common.inactive'] || 'Inactive';
}

export function formatCapacity(capacity?: number): string {
  return capacity ? `${capacity} seats` : '—';
}

export function getDeleteConfirmMessage(dict: Record<string, string>): string {
  return dict?.['confirmation.deleteTable'] || 'Are you sure you want to delete this table?';
}

export function getDeactivateConfirmMessage(dict: Record<string, string>): string {
  return dict?.['confirmation.deactivateTable'] || 'Are you sure you want to deactivate this table?';
}
