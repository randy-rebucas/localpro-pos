import type { Discount } from '@/hooks/useDiscountsList';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

type DiscountStatus = 'valid' | 'inactive' | 'scheduled' | 'expired';

export function getDiscountStatus(discount: Discount, now: Date = new Date()): DiscountStatus {
  if (!discount.isActive) return 'inactive';
  if (now < new Date(discount.validFrom)) return 'scheduled';
  if (now > new Date(discount.validUntil)) return 'expired';
  return 'valid';
}

const STATUS_BADGE: Record<DiscountStatus, string> = {
  valid: 'bg-win8-success text-white',
  inactive: 'bg-win8-danger text-white',
  scheduled: 'bg-win8-info text-white',
  expired: 'bg-win8-warning text-white',
};

export function getStatusBadgeClass(discount: Discount): string {
  return STATUS_BADGE[getDiscountStatus(discount)] || 'bg-gray-500 text-white';
}

export function getStatusLabel(discount: Discount, dict: Dict): string {
  switch (getDiscountStatus(discount)) {
    case 'valid': return dict?.admin?.valid || 'Valid';
    case 'inactive': return dict?.admin?.inactive || 'Inactive';
    case 'scheduled': return dict?.admin?.scheduled || 'Scheduled';
    default: return dict?.admin?.expired || 'Expired';
  }
}

const TYPE_BADGE: Record<Discount['type'], string> = {
  percentage: 'bg-brand text-white',
  fixed: 'bg-brand-navy text-white',
};

export function getTypeBadgeClass(type: Discount['type']): string {
  return TYPE_BADGE[type] || 'bg-gray-500 text-white';
}

export function getTypeLabel(type: Discount['type'], dict: Dict): string {
  return type === 'percentage' ? (dict?.admin?.percentage || 'Percentage') : (dict?.admin?.fixed || 'Fixed');
}

export function getDeleteConfirmMessage(dict: Dict, code?: string): string {
  if (code) {
    return (dict?.admin?.deleteDiscountNamed || 'Delete discount "{code}"? This cannot be undone.').replace('{code}', code);
  }
  return dict?.admin?.deleteConfirm || 'Are you sure you want to delete this discount?';
}

export function getDeleteSuccessMessage(dict: Dict): string {
  return dict?.admin?.deleteSuccess || 'Discount deleted successfully';
}

export function getDeleteErrorMessage(dict: Dict): string {
  return dict?.admin?.deleteError || 'Failed to delete discount';
}

export function getSaveSuccessMessage(isEdit: boolean, dict: Dict): string {
  if (isEdit) {
    return dict?.admin?.discountUpdated || 'Discount updated successfully';
  }
  return dict?.admin?.discountCreated || 'Discount created successfully';
}

export function getSaveErrorMessage(dict: Dict): string {
  return dict?.admin?.saveError || 'Failed to save discount';
}

export function getToggleStatusMessage(isActive: boolean, dict: Dict): string {
  return isActive
    ? `${dict?.admin?.discount || 'Discount'} ${dict?.admin?.activated || 'activated'} ${dict?.admin?.successfully || 'successfully'}`
    : `${dict?.admin?.discount || 'Discount'} ${dict?.admin?.deactivated || 'deactivated'} ${dict?.admin?.successfully || 'successfully'}`;
}

export function getToggleButtonLabel(isActive: boolean, dict: Dict): string {
  return isActive ? (dict?.admin?.deactivate || 'Deactivate') : (dict?.admin?.activate || 'Activate');
}

export function getToggleButtonClass(isActive: boolean): string {
  return isActive ? 'bg-win8-danger' : 'bg-win8-success';
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
