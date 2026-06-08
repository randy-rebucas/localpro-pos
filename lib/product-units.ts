/**
 * Product unit-of-measure (UOM) helpers.
 * Stock is always stored in base units; sale units convert via factor.
 */

export interface ProductSaleUnit {
  code: string;
  label: string;
  factor: number;
  price?: number;
  barcode?: string;
  isDefault?: boolean;
}

export const DEFAULT_BASE_UNIT = 'pc';

export const DEFAULT_SALE_UNIT: ProductSaleUnit = {
  code: 'pc',
  label: 'Piece',
  factor: 1,
  isDefault: true,
};

export function normalizeSaleUnits(
  saleUnits?: ProductSaleUnit[] | null,
  options?: { ensureDefault?: boolean }
): ProductSaleUnit[] {
  if (!saleUnits || saleUnits.length === 0) {
    return [{ ...DEFAULT_SALE_UNIT }];
  }

  const cleaned = saleUnits
    .filter((u) => u.code?.trim() && u.label?.trim() && u.factor > 0)
    .map((u) => ({
      code: u.code.trim().toLowerCase(),
      label: u.label.trim(),
      factor: u.factor,
      ...(u.price !== undefined && u.price !== null ? { price: u.price } : {}),
      ...(u.barcode?.trim() ? { barcode: u.barcode.trim() } : {}),
      isDefault: u.isDefault === true,
    }));

  if (cleaned.length === 0) {
    return [{ ...DEFAULT_SALE_UNIT }];
  }

  if (options?.ensureDefault !== false) {
    const hasDefault = cleaned.some((u) => u.isDefault);
    if (!hasDefault) {
      cleaned[0].isDefault = true;
    }
  }

  return cleaned;
}

export function getSaleUnits(product: { saleUnits?: ProductSaleUnit[] }): ProductSaleUnit[] {
  return normalizeSaleUnits(product.saleUnits);
}

export function getDefaultSaleUnit(product: { saleUnits?: ProductSaleUnit[] }): ProductSaleUnit {
  const units = getSaleUnits(product);
  return units.find((u) => u.isDefault) || units[0];
}

export function findSaleUnit(
  product: { saleUnits?: ProductSaleUnit[] },
  code?: string
): ProductSaleUnit {
  const units = getSaleUnits(product);
  if (!code) return getDefaultSaleUnit(product);
  const normalized = code.trim().toLowerCase();
  return units.find((u) => u.code === normalized) || getDefaultSaleUnit(product);
}

export function hasMultipleSaleUnits(product: { saleUnits?: ProductSaleUnit[] }): boolean {
  return getSaleUnits(product).length > 1;
}

export function resolveSaleUnitPrice(
  product: { price: number },
  unit: ProductSaleUnit
): number {
  if (unit.price !== undefined && unit.price !== null && !Number.isNaN(unit.price)) {
    return unit.price;
  }
  return Math.round(product.price * unit.factor * 100) / 100;
}

export function getBaseQuantity(quantity: number, unitFactor: number): number {
  return quantity * unitFactor;
}

export function getMaxSaleUnitQuantity(stockBase: number, factor: number): number {
  if (factor <= 0) return 0;
  return Math.floor(stockBase / factor);
}

export function formatStockWithUnits(
  stock: number,
  baseUnit: string,
  saleUnits?: ProductSaleUnit[]
): string {
  const units = getSaleUnits({ saleUnits });
  const packUnit = [...units]
    .filter((u) => u.factor > 1)
    .sort((a, b) => b.factor - a.factor)[0];

  if (!packUnit) {
    return `${stock} ${baseUnit || DEFAULT_BASE_UNIT}`;
  }

  const boxes = Math.floor(stock / packUnit.factor);
  const remainder = stock % packUnit.factor;

  if (remainder === 0) {
    return `${boxes} ${packUnit.label}`;
  }
  if (boxes === 0) {
    return `${remainder} ${baseUnit || DEFAULT_BASE_UNIT}`;
  }
  return `${boxes} ${packUnit.label} + ${remainder} ${baseUnit || DEFAULT_BASE_UNIT}`;
}

export function formatReceiptItemLine(
  name: string,
  quantity: number,
  saleUnitLabel?: string
): string {
  if (saleUnitLabel && saleUnitLabel !== DEFAULT_SALE_UNIT.label) {
    return `${quantity} ${saleUnitLabel} — ${name}`;
  }
  return name;
}

export function findProductByBarcode<
  T extends { barcode?: string; sku?: string; _id: string; saleUnits?: ProductSaleUnit[] },
>(products: T[], code: string): { product: T; saleUnit: ProductSaleUnit } | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  for (const product of products) {
    if (product.barcode === trimmed || product.sku === trimmed || product._id === trimmed) {
      return { product, saleUnit: getDefaultSaleUnit(product) };
    }
    for (const unit of getSaleUnits(product)) {
      if (unit.barcode === trimmed) {
        return { product, saleUnit: unit };
      }
    }
  }
  return null;
}

export interface SaleUnitValidationMessage {
  field: string;
  message: string;
}

export function validateSaleUnitsConfig(
  baseUnit: string | undefined,
  saleUnits: ProductSaleUnit[] | undefined
): SaleUnitValidationMessage[] {
  const errors: SaleUnitValidationMessage[] = [];
  const bu = baseUnit?.trim();
  if (bu && bu.length > 20) {
    errors.push({ field: 'baseUnit', message: 'Base unit must be 20 characters or less' });
  }

  const units = saleUnits ?? [];
  if (units.length === 0) return errors;

  const codes = new Set<string>();
  let defaultCount = 0;

  units.forEach((unit, index) => {
    const prefix = `saleUnits[${index}]`;
    if (!unit.code?.trim()) {
      errors.push({ field: `${prefix}.code`, message: 'Sale unit code is required' });
    }
    if (!unit.label?.trim()) {
      errors.push({ field: `${prefix}.label`, message: 'Sale unit label is required' });
    }
    if (!unit.factor || unit.factor <= 0) {
      errors.push({ field: `${prefix}.factor`, message: 'Sale unit factor must be greater than 0' });
    }
    const code = unit.code?.trim().toLowerCase();
    if (code) {
      if (codes.has(code)) {
        errors.push({ field: `${prefix}.code`, message: `Duplicate sale unit code: ${code}` });
      }
      codes.add(code);
    }
    if (unit.isDefault) defaultCount += 1;
    if (unit.price !== undefined && (Number.isNaN(unit.price) || unit.price < 0)) {
      errors.push({ field: `${prefix}.price`, message: 'Sale unit price must be a non-negative number' });
    }
    if (unit.barcode && unit.barcode.length > 100) {
      errors.push({ field: `${prefix}.barcode`, message: 'Unit barcode must be 100 characters or less' });
    }
  });

  if (defaultCount > 1) {
    errors.push({ field: 'saleUnits', message: 'Only one sale unit can be marked as default' });
  }

  return errors;
}
