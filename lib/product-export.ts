import { arrayToCSV } from '@/lib/export';

export const PRODUCT_EXPORT_HEADERS = ['name', 'sku', 'category', 'price'] as const;

export type ProductExportHeader = (typeof PRODUCT_EXPORT_HEADERS)[number];

export interface ExportableProduct {
  name: string;
  sku?: string;
  category?: string;
  categoryId?: { name?: string } | string;
  price: number;
}

function getCategoryName(product: ExportableProduct): string {
  if (typeof product.categoryId === 'object' && product.categoryId?.name) {
    return product.categoryId.name;
  }
  return product.category || '';
}

export function mapProductToExportRow(product: ExportableProduct): Record<ProductExportHeader, string | number> {
  return {
    name: product.name,
    sku: product.sku || '',
    category: getCategoryName(product),
    price: product.price ?? 0,
  };
}

export function productsToExportCSV(products: ExportableProduct[]): string {
  const rows = products.map(mapProductToExportRow);
  return arrayToCSV(rows, [...PRODUCT_EXPORT_HEADERS]);
}

export interface ProductDisplayExportLabels {
  name: string;
  sku: string;
  category: string;
  price: string;
}

export function mapProductToDisplayRow(
  product: ExportableProduct,
  labels: ProductDisplayExportLabels
): Record<string, string | number> {
  const row = mapProductToExportRow(product);
  return {
    [labels.name]: row.name,
    [labels.sku]: row.sku,
    [labels.category]: row.category,
    [labels.price]: row.price,
  };
}

export function getProductDisplayExportHeaders(labels: ProductDisplayExportLabels): string[] {
  return [labels.name, labels.sku, labels.category, labels.price];
}
