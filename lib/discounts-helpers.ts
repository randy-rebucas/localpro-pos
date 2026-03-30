import type { Discount } from '@/hooks/useDiscountsList';

export function getStatusBadgeClass(discount: Discount): string {
  const now = new Date();
  const validFrom = new Date(discount.validFrom);
  const validUntil = new Date(discount.validUntil);
  const isValid = now >= validFrom && now <= validUntil && discount.isActive;

  if (isValid) {
    return 'bg-green-100 text-green-800 border-green-300';
  }
  if (!discount.isActive) {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
}

export function getStatusLabel(discount: Discount, dict: any): string {
  const now = new Date();
  const validFrom = new Date(discount.validFrom);
  const validUntil = new Date(discount.validUntil);
  const isValid = now >= validFrom && now <= validUntil && discount.isActive;

  if (isValid) return dict?.admin?.valid || 'Valid';
  if (!discount.isActive) return dict?.admin?.inactive || 'Inactive';
  return dict?.admin?.expired || 'Expired';
}

export function getTypeBadgeClass(_type: 'percentage' | 'fixed'): string {
  return 'px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800';
}

export function getDeleteConfirmMessage(dict: any): string {
  return dict?.admin?.deleteConfirm || 'Are you sure you want to delete this discount?';
}

export function getDeleteSuccessMessage(dict: any): string {
  return dict?.admin?.deleteSuccess || 'Discount deleted successfully';
}

export function getDeleteErrorMessage(dict: any): string {
  return dict?.admin?.deleteError || 'Failed to delete discount';
}

export function getSaveSuccessMessage(isEdit: boolean, dict: any): string {
  if (isEdit) {
    return dict?.admin?.updateSuccess || 'Discount updated successfully';
  }
  return dict?.admin?.saveSuccess || 'Discount created successfully';
}

export function getSaveErrorMessage(dict: any): string {
  return dict?.admin?.saveError || 'Failed to save discount';
}

export function getToggleStatusMessage(isActive: boolean, dict: any): string {
  return isActive
    ? `${dict?.admin?.discount || 'Discount'} ${dict?.admin?.activated || 'activated'} ${dict?.admin?.successfully || 'successfully'}`
    : `${dict?.admin?.discount || 'Discount'} ${dict?.admin?.deactivated || 'deactivated'} ${dict?.admin?.successfully || 'successfully'}`;
}

export function getToggleButtonLabel(isActive: boolean, dict: any): string {
  return isActive ? (dict?.admin?.deactivate || 'Deactivate') : (dict?.admin?.activate || 'Activate');
}

export function getToggleButtonClass(isActive: boolean): string {
  return isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900';
}

export function formatDiscountValue(discount: Discount): string {
  if (discount.type === 'percentage') {
    return `${discount.value}%`;
  }
  return `${discount.value}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}
