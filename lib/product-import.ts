import { validateProduct } from '@/lib/validation';
import { generateUniqueProductSKU } from '@/lib/products-helpers';
import type { ProductSaleUnit } from '@/lib/product-units';

export const PRODUCT_IMPORT_HEADERS = [
  'name',
  'sku',
  'barcode',
  'category',
  'price',
  'stock',
  'description',
  'image',
  'product_type',
  'track_inventory',
  'tax_exempt',
  'low_stock_threshold',
  'base_unit',
  'sale_unit_code',
  'sale_unit_label',
  'sale_unit_factor',
  'sale_unit_price',
  'sale_unit_barcode',
] as const;

export type ProductImportHeader = (typeof PRODUCT_IMPORT_HEADERS)[number];

export interface ProductImportRow {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  price: number;
  stock: number;
  description?: string;
  image?: string;
  productType: 'regular' | 'service';
  trackInventory: boolean;
  taxExempt: boolean;
  lowStockThreshold?: number;
  baseUnit?: string;
  saleUnits?: ProductSaleUnit[];
}

export interface ProductImportPreviewRow {
  row: number;
  status: 'valid' | 'error';
  data?: ProductImportRow;
  errors?: string[];
}

const HEADER_ALIASES: Record<string, ProductImportHeader> = {
  name: 'name',
  sku: 'sku',
  barcode: 'barcode',
  category: 'category',
  price: 'price',
  stock: 'stock',
  description: 'description',
  image: 'image',
  product_type: 'product_type',
  producttype: 'product_type',
  type: 'product_type',
  track_inventory: 'track_inventory',
  trackinventory: 'track_inventory',
  tax_exempt: 'tax_exempt',
  taxexempt: 'tax_exempt',
  low_stock_threshold: 'low_stock_threshold',
  lowstockthreshold: 'low_stock_threshold',
  base_unit: 'base_unit',
  baseunit: 'base_unit',
  sale_unit_code: 'sale_unit_code',
  saleunitcode: 'sale_unit_code',
  sale_unit_label: 'sale_unit_label',
  saleunitlabel: 'sale_unit_label',
  sale_unit_factor: 'sale_unit_factor',
  saleunitfactor: 'sale_unit_factor',
  sale_unit_price: 'sale_unit_price',
  saleunitprice: 'sale_unit_price',
  sale_unit_barcode: 'sale_unit_barcode',
  saleunitbarcode: 'sale_unit_barcode',
};

export function getProductImportTemplateCSV(): string {
  const headers = PRODUCT_IMPORT_HEADERS.join(',');
  const example = [
    'Sample Product',
    '',
    '',
    'General',
    '99.99',
    '50',
    'Optional description',
    '',
    'regular',
    'yes',
    'no',
    '10',
    'pc',
    'box',
    'Box of 100',
    '100',
    '450',
    '',
  ].join(',');
  return `${headers}\n${example}\n`;
}

function normalizeHeader(header: string): ProductImportHeader | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, '_');
  return HEADER_ALIASES[key] ?? null;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  const v = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return defaultValue;
}

function parseProductType(value: string | undefined): 'regular' | 'service' | null {
  if (!value || !value.trim()) return 'regular';
  const v = value.trim().toLowerCase();
  if (v === 'regular' || v === 'service') return v;
  return null;
}

export function parseCSV(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(current);
      current = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      current = '';
      if (c === '\r') i++;
    } else if (c !== '\r') {
      current += c;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

export function csvToProductRows(csvText: string): { rows: Record<ProductImportHeader, string>[]; errors: string[] } {
  const parsed = parseCSV(csvText);
  if (parsed.length === 0) {
    return { rows: [], errors: ['CSV file is empty'] };
  }

  const headerRow = parsed[0];
  const columnMap: Array<{ index: number; header: ProductImportHeader }> = [];
  const errors: string[] = [];

  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) {
      columnMap.push({ index, header: normalized });
    }
  });

  if (!columnMap.some((c) => c.header === 'name')) {
    errors.push('CSV must include a "name" column');
  }
  if (!columnMap.some((c) => c.header === 'price')) {
    errors.push('CSV must include a "price" column');
  }
  if (errors.length > 0) {
    return { rows: [], errors };
  }

  const rows: Record<ProductImportHeader, string>[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const cells = parsed[i];
    const record = {} as Record<ProductImportHeader, string>;
    for (const col of columnMap) {
      record[col.header] = (cells[col.index] ?? '').trim();
    }
    if (Object.values(record).every((v) => !v)) continue;
    rows.push(record);
  }

  return { rows, errors: [] };
}

export function mapCsvRecordToProductRow(
  record: Record<ProductImportHeader, string>,
  rowNumber: number
): ProductImportPreviewRow {
  const errors: string[] = [];

  const name = record.name?.trim();
  if (!name) {
    errors.push('Name is required');
  }

  const priceRaw = record.price?.trim();
  let price = NaN;
  if (!priceRaw) {
    errors.push('Price is required');
  } else {
    price = Number(priceRaw);
    if (Number.isNaN(price)) errors.push('Price must be a number');
  }

  const stockRaw = record.stock?.trim();
  let stock = 0;
  if (stockRaw) {
    stock = Number(stockRaw);
    if (Number.isNaN(stock) || !Number.isInteger(stock) || stock < 0) {
      errors.push('Stock must be a non-negative integer');
    }
  }

  const productType = parseProductType(record.product_type);
  if (productType === null) {
    errors.push('Product type must be "regular" or "service"');
  }

  let lowStockThreshold: number | undefined;
  const thresholdRaw = record.low_stock_threshold?.trim();
  if (thresholdRaw) {
    lowStockThreshold = Number(thresholdRaw);
    if (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0) {
      errors.push('Low stock threshold must be a non-negative number');
    }
  }

  const baseUnit = record.base_unit?.trim() || 'pc';
  const saleUnits: ProductSaleUnit[] = [{ code: 'pc', label: 'Piece', factor: 1, isDefault: true }];
  const altCode = record.sale_unit_code?.trim();
  const altLabel = record.sale_unit_label?.trim();
  const altFactorRaw = record.sale_unit_factor?.trim();
  if (altCode && altLabel && altFactorRaw) {
    const altFactor = Number(altFactorRaw);
    if (!Number.isNaN(altFactor) && altFactor > 0) {
      saleUnits.push({
        code: altCode.toLowerCase(),
        label: altLabel,
        factor: altFactor,
        ...(record.sale_unit_price?.trim()
          ? { price: Number(record.sale_unit_price) }
          : {}),
        ...(record.sale_unit_barcode?.trim()
          ? { barcode: record.sale_unit_barcode.trim() }
          : {}),
        isDefault: false,
      });
    } else {
      errors.push('Sale unit factor must be a positive number when sale unit code/label are set');
    }
  }

  const data: ProductImportRow = {
    name: name || '',
    sku: record.sku?.trim() || undefined,
    barcode: record.barcode?.trim() || undefined,
    category: record.category?.trim() || undefined,
    price,
    stock,
    description: record.description?.trim() || undefined,
    image: record.image?.trim() || undefined,
    productType: productType ?? 'regular',
    trackInventory: parseBoolean(record.track_inventory, true),
    taxExempt: parseBoolean(record.tax_exempt, false),
    lowStockThreshold,
    baseUnit,
    saleUnits,
  };

  const validationErrors = validateProduct({
    name: data.name,
    price: data.price,
    stock: data.stock,
    sku: data.sku,
    barcode: data.barcode,
    image: data.image,
    trackInventory: data.trackInventory,
    baseUnit: data.baseUnit,
    saleUnits: data.saleUnits,
  });
  for (const err of validationErrors) {
    errors.push(err.message);
  }

  if (errors.length > 0) {
    return { row: rowNumber, status: 'error', errors: [...new Set(errors)] };
  }

  return { row: rowNumber, status: 'valid', data };
}

export function validateImportRows(
  csvRows: Record<ProductImportHeader, string>[],
  options?: {
    /** Mutable set of SKUs already used in the tenant (includes DB + rows validated so far). */
    tenantSkus?: Set<string>;
    existingBarcodes?: Set<string>;
  }
): ProductImportPreviewRow[] {
  const tenantSkus = options?.tenantSkus ?? new Set<string>();
  const seenBarcodes = new Set<string>();
  const results: ProductImportPreviewRow[] = [];

  csvRows.forEach((record, index) => {
    const rowNumber = index + 2;
    const result = mapCsvRecordToProductRow(record, rowNumber);

    if (result.status === 'valid' && result.data) {
      const extraErrors: string[] = [];

      const skuResult = assignImportSku(result.data, tenantSkus);
      if (!skuResult.ok) {
        extraErrors.push(skuResult.error);
      } else {
        result.data.sku = skuResult.sku;
      }

      if (result.data.barcode) {
        const barcodeKey = result.data.barcode.toLowerCase();
        if (seenBarcodes.has(barcodeKey)) {
          extraErrors.push('Duplicate barcode in import file');
        } else if (options?.existingBarcodes?.has(barcodeKey)) {
          extraErrors.push('Barcode already exists');
        } else {
          seenBarcodes.add(barcodeKey);
        }
      }

      if (extraErrors.length > 0) {
        results.push({ row: rowNumber, status: 'error', errors: extraErrors });
        return;
      }
    }

    results.push(result);
  });

  return results;
}

export const MAX_PRODUCT_IMPORT_ROWS = 500;

/** Collect all SKUs in use for a tenant (main + variation, any status). */
export function collectTenantSkus(
  products: Array<{ sku?: string | null; variations?: Array<{ sku?: string | null }> | null }>
): Set<string> {
  const skus = new Set<string>();
  for (const product of products) {
    const main = product.sku?.trim();
    if (main) skus.add(main.toLowerCase());
    for (const variation of product.variations ?? []) {
      const variationSku = variation.sku?.trim();
      if (variationSku) skus.add(variationSku.toLowerCase());
    }
  }
  return skus;
}

/** Assign or validate SKU against the tenant-wide registry (mutates the set). */
export function assignImportSku(
  data: ProductImportRow,
  tenantSkus: Set<string>
): { ok: true; sku: string } | { ok: false; error: string } {
  const provided = data.sku?.trim();
  if (!provided) {
    return { ok: true, sku: generateUniqueProductSKU(data.name, tenantSkus) };
  }

  const key = provided.toLowerCase();
  if (tenantSkus.has(key)) {
    return { ok: false, error: 'SKU already exists in this store' };
  }

  tenantSkus.add(key);
  return { ok: true, sku: provided };
}
