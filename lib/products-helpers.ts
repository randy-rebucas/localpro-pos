/**
 * Products page helper functions
 */

type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getProductDeletedMessage(dict: Dict): string {
  return dict?.common?.productDeletedSuccess || 'Product deleted successfully';
}

export function getProductDeleteErrorMessage(dict: Dict): string {
  return dict?.common?.failedToDeleteProduct || 'Failed to delete product';
}

export function getProductsFetchErrorMessage(dict: Dict): string {
  return dict?.common?.failedToFetchProducts || 'Failed to fetch products';
}

export function getDeleteProductConfirmTitle(dict: Dict): string {
  return dict?.common?.deleteProductConfirmTitle || 'Delete Product';
}

export function getDeleteProductConfirmMessage(dict: Dict): string {
  return dict?.common?.deleteProductConfirm || 'Are you sure you want to delete this product?';
}

export function getNoCategoryFoundMessage(dict: Dict): string {
  return dict?.admin?.noCategoryFound || 'No category found';
}

export function getSearchCategoryPlaceholder(dict: Dict): string {
  return dict?.admin?.searchCategory || 'Type to search categories...';
}

export function generateEAN13(): string {
  // 12 random digits then compute check digit
  const digits: number[] = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const checksum = digits.reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (checksum % 10)) % 10;
  return [...digits, checkDigit].join('');
}

/** Generate a random SKU from product name (max 50 chars). */
export function generateProductSKU(name?: string): string {
  const cleanName = (name || 'PRD').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = cleanName.substring(0, 3).padEnd(3, 'X');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${random}`.slice(0, 50);
}

/** Generate a SKU unique within the tenant registry (mutates the set on success). */
export function generateUniqueProductSKU(name: string, skuRegistry: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const sku = generateProductSKU(name);
    const key = sku.toLowerCase();
    if (!skuRegistry.has(key)) {
      skuRegistry.add(key);
      return sku;
    }
  }
  for (let i = 0; i < 50; i++) {
    const sku = `${generateProductSKU(name)}${i.toString(36).toUpperCase()}`.slice(0, 50);
    const key = sku.toLowerCase();
    if (!skuRegistry.has(key)) {
      skuRegistry.add(key);
      return sku;
    }
  }
  throw new Error('Unable to generate unique SKU');
}

export function getBulkProductUpdateConfirmMessage(count: number, dict: Dict): string {
  const defaultMsg = `Apply changes to ${count} selected product(s)?`;
  return (
    dict?.common?.bulkUpdateProductConfirm
      ?.replace('{count}', count.toString()) || defaultMsg
  );
}

export function getBulkProductUpdateSuccessMessage(count: number, dict: Dict): string {
  return (
    dict?.common?.bulkUpdateSuccess
      ?.replace('{count}', count.toString()) || `${count} product(s) updated successfully`
  );
}

export function getCategoryNameFromProduct(categoryId: { name?: string; _id?: string } | string | null | undefined, categories: { _id: string; name: string }[]): string {
  if (typeof categoryId === 'object' && categoryId?.name) {
    return categoryId.name;
  }
  if (typeof categoryId === 'string') {
    const category = categories.find((c) => c._id === categoryId);
    return category?.name || '-';
  }
  return '-';
}
