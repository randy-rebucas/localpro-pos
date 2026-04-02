import { type TranslationDict } from '@/types/dictionary';

type Dict = TranslationDict | null | undefined;

export function getPaymentMethodLabel(method: string, dict: Dict): string {
  const labels: Record<string, string> = {
    cash: dict?.admin?.cash || 'Cash',
    card: dict?.admin?.card || 'Card',
    digital: dict?.admin?.digital || 'Digital',
    other: dict?.admin?.other || 'Other',
  };
  return labels[method] || method;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

export function validateDateRange(startDate: string, endDate: string): { valid: boolean; error?: string } {
  if (!startDate || !endDate) {
    return { valid: true };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return { valid: false, error: 'Start date must be before end date' };
  }

  return { valid: true };
}

export function getDeleteConfirmMessage(dict: Dict): string {
  return dict?.common?.deleteExpenseConfirm || dict?.admin?.deleteExpenseConfirm || 'Are you sure you want to delete this expense?';
}

export function getDeleteSuccessMessage(dict: Dict): string {
  return dict?.admin?.expenseDeletedSuccess || 'Expense deleted successfully';
}

export function getDeleteErrorMessage(dict: Dict): string {
  return dict?.admin?.failedToDeleteExpense || 'Failed to delete expense';
}

export function getSaveSuccessMessage(isEdit: boolean, dict: Dict): string {
  if (isEdit) {
    return dict?.common?.expenseUpdatedSuccess || 'Expense updated successfully';
  }
  return dict?.common?.expenseCreatedSuccess || 'Expense created successfully';
}

export function getSaveErrorMessage(dict: Dict): string {
  return dict?.admin?.failedToSaveExpense || 'Failed to save expense';
}

export function getDateValidationError(field: 'startDate' | 'endDate', dict?: Dict): string {
  if (field === 'endDate') {
    return dict?.common?.endDateAfterStartDate || 'End date must be after start date';
  }
  return dict?.common?.startDateBeforeEndDate || 'Start date must be before end date';
}

export function formatPaymentMethodDisplay(method: string): string {
  return method.charAt(0).toUpperCase() + method.slice(1);
}

export function getExpenseNameBadgeClass(): string {
  return 'px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800';
}
