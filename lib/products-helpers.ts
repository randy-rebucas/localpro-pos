/**
 * Products page helper functions
 */

export function getProductDeletedMessage(dict: any): string {
  return dict?.common?.productDeletedSuccess || 'Product deleted successfully';
}

export function getProductDeleteErrorMessage(dict: any): string {
  return dict?.common?.failedToDeleteProduct || 'Failed to delete product';
}

export function getProductsFetchErrorMessage(dict: any): string {
  return dict?.common?.failedToFetchProducts || 'Failed to fetch products';
}

export function getDeleteProductConfirmTitle(dict: any): string {
  return dict?.common?.deleteProductConfirmTitle || 'Delete Product';
}

export function getDeleteProductConfirmMessage(dict: any): string {
  return dict?.common?.deleteProductConfirm || 'Are you sure you want to delete this product?';
}

export function getNoCategoryFoundMessage(dict: any): string {
  return dict?.admin?.noCategoryFound || 'No category found';
}

export function getSearchCategoryPlaceholder(dict: any): string {
  return dict?.admin?.searchCategory || 'Type to search categories...';
}

export function generateEAN13(): string {
  // 12 random digits then compute check digit
  const digits: number[] = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const checksum = digits.reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (checksum % 10)) % 10;
  return [...digits, checkDigit].join('');
}

export function getCategoryNameFromProduct(categoryId: any, categories: any[]): string {
  if (typeof categoryId === 'object' && categoryId?.name) {
    return categoryId.name;
  }
  if (typeof categoryId === 'string') {
    const category = categories.find((c) => c._id === categoryId);
    return category?.name || '-';
  }
  return '-';
}
