type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getDeleteConfirmMessage(dict: Dict): string {
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
    return dict?.admin?.updateSuccess || 'Discount updated successfully';
  }
  return dict?.admin?.saveSuccess || 'Discount created successfully';
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
