import prisma from '@/lib/db';
import type { ITenantSettings } from '@/models/Tenant';

/**
 * BIR (Bureau of Internal Revenue) Philippines discount rates
 * - Senior Citizens: 20% discount (RA 9994)
 * - Persons with Disability (PWD): 20% discount (RA 10754)
 * Both are VAT-exempt when applicable
 */
const BIR_DISCOUNT_CATEGORIES: Record<string, { rate: number; vatExempt: boolean }> = {
  senior: { rate: 20, vatExempt: true },
  pwd: { rate: 20, vatExempt: true },
};

/**
 * Calculate BIR-mandated discount and VAT exemption
 * Returns the discount amount and whether VAT should be exempt
 */
export function calculateBIRDiscount(
  subtotal: number,
  discountCategory?: string
): { birDiscountAmount: number; isVatExempt: boolean } {
  if (!discountCategory || !BIR_DISCOUNT_CATEGORIES[discountCategory]) {
    return { birDiscountAmount: 0, isVatExempt: false };
  }

  const config = BIR_DISCOUNT_CATEGORIES[discountCategory];
  // BIR mandates: discount computed on the VAT-exclusive price
  // VAT-exclusive = subtotal / 1.12 (assuming 12% VAT)
  const vatExclusivePrice = subtotal / 1.12;
  const birDiscountAmount = Math.round(vatExclusivePrice * (config.rate / 100) * 100) / 100;

  return {
    birDiscountAmount,
    isVatExempt: config.vatExempt,
  };
}

export interface TaxRegion {
  country?: string;
  state?: string;
  city?: string;
  zipCode?: string;
}

/**
 * Whether a tax rule's (optional) region scoping matches the transaction's region.
 * A rule with no region fields set applies everywhere (backward compatible with
 * rules created before region scoping). A rule with region fields set only
 * matches when every field it specifies matches the given region.
 */
function ruleMatchesRegion(
  rule: { regionCountry: string | null; regionState: string | null; regionCity: string | null; regionZipCodes: string[] },
  region?: TaxRegion
): boolean {
  const { regionCountry, regionState, regionCity, regionZipCodes } = rule;
  if (!regionCountry && !regionState && !regionCity && regionZipCodes.length === 0) {
    return true; // No region scoping on this rule — applies everywhere
  }
  if (!region) return false; // Rule is region-scoped but no transaction region is known

  const eq = (a?: string | null, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

  if (regionCountry && !eq(regionCountry, region.country)) return false;
  if (regionState && !eq(regionState, region.state)) return false;
  if (regionCity && !eq(regionCity, region.city)) return false;
  if (regionZipCodes.length > 0) {
    if (!region.zipCode || !regionZipCodes.some((z) => z.trim() === region.zipCode?.trim())) return false;
  }
  return true;
}

/**
 * Calculate tax amount for a transaction
 * Uses TaxRule model if available, otherwise falls back to Tenant settings
 */
export async function calculateTax(
  tenantId: string,
  subtotalAfterDiscount: number,
  items: Array<{
    productId?: string;
    productType?: 'regular' | 'bundle' | 'service';
    categoryId?: string;
    taxExempt?: boolean;
    zeroRated?: boolean;
    subtotal?: number;
  }>,
  tenantSettings?: ITenantSettings,
  discountCategory?: string,
  region?: TaxRegion
): Promise<{ taxAmount: number; taxRate: number; taxLabel: string; taxableAmount: number; exemptAmount: number; zeroRatedAmount: number }> {
  // Default values
  let taxAmount = 0;
  let taxRate = 0;
  let taxLabel = 'Tax';

  // BIR: Senior/PWD transactions are fully VAT-exempt
  if (discountCategory && BIR_DISCOUNT_CATEGORIES[discountCategory]?.vatExempt) {
    return {
      taxAmount: 0,
      taxRate: 0,
      taxLabel: `VAT Exempt (${discountCategory.toUpperCase()})`,
      taxableAmount: 0,
      exemptAmount: subtotalAfterDiscount,
      zeroRatedAmount: 0,
    };
  }

  // Calculate exempt / zero-rated vs taxable amounts from item-level flags
  let exemptAmount = 0;
  let zeroRatedAmount = 0;
  let taxableAmount = subtotalAfterDiscount;

  const hasItemSubtotals = items.some(item => item.subtotal !== undefined);
  if (hasItemSubtotals) {
    const totalItemSubtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    exemptAmount = items
      .filter(item => item.taxExempt && !item.zeroRated)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);
    zeroRatedAmount = items
      .filter(item => item.zeroRated)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);

    // Pro-rate the exempt/zero-rated amounts against the discounted subtotal
    if (totalItemSubtotal > 0 && exemptAmount > 0) {
      const exemptRatio = exemptAmount / totalItemSubtotal;
      exemptAmount = Math.round(subtotalAfterDiscount * exemptRatio * 100) / 100;
    }
    if (totalItemSubtotal > 0 && zeroRatedAmount > 0) {
      const zeroRatedRatio = zeroRatedAmount / totalItemSubtotal;
      zeroRatedAmount = Math.round(subtotalAfterDiscount * zeroRatedRatio * 100) / 100;
    }
    taxableAmount = Math.max(0, subtotalAfterDiscount - exemptAmount - zeroRatedAmount);
  }

  // Try to get tax rules from TaxRule model first
  const taxRules = await prisma.taxRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: { priority: 'desc' },
    include: { categories: true, products: true },
  });

  // Only calculate tax on the taxable portion (excludes VAT-exempt items)
  if (taxRules.length > 0) {
    // Use TaxRule model - apply the highest priority matching rule
    for (const rule of taxRules) {
      let applies = false;

      // Check if rule applies to this transaction (only non-exempt, non-zero-rated items)
      const taxableItems = items.filter(item => !item.taxExempt && !item.zeroRated);
      if (taxableItems.length === 0) break; // All items are exempt or zero-rated

      if (rule.appliesTo === 'all') {
        applies = true;
      } else if (rule.appliesTo === 'products') {
        applies = taxableItems.some(item => item.productType === 'regular' || item.productType === 'bundle');
      } else if (rule.appliesTo === 'services') {
        applies = taxableItems.some(item => item.productType === 'service');
      } else if (rule.appliesTo === 'categories') {
        if (rule.categories.length > 0) {
          const categoryIds = new Set(rule.categories.map((c) => c.categoryId));
          applies = taxableItems.some(item => item.categoryId && categoryIds.has(item.categoryId));
        }
        // If no categories specified on a category rule, skip to next rule
      }

      // Product-specific rules override appliesTo (only if products are specified)
      if (rule.products.length > 0) {
        const productIds = new Set(rule.products.map((p) => p.productId));
        applies = taxableItems.some(item => item.productId && productIds.has(item.productId));
      }

      if (applies && !ruleMatchesRegion(rule, region)) {
        applies = false;
      }

      if (applies) {
        taxRate = Math.min(Math.max(Number(rule.rate), 0), 100); // Clamp rate 0-100
        taxLabel = rule.label;
        taxAmount = (taxableAmount * taxRate) / 100;
        // Ensure tax doesn't exceed taxable amount
        taxAmount = Math.min(taxAmount, taxableAmount);
        break; // Use first matching rule
      }
    }
  } else {
    // Fall back to Tenant settings
    if (tenantSettings?.taxEnabled && tenantSettings.taxRate != null && tenantSettings.taxRate > 0) {
      taxRate = Math.min(Math.max(tenantSettings.taxRate, 0), 100);
      taxLabel = tenantSettings.taxLabel || 'Tax';
      taxAmount = (taxableAmount * taxRate) / 100;
      taxAmount = Math.min(taxAmount, taxableAmount);
    }
  }

  return {
    taxAmount: Math.round(taxAmount * 100) / 100, // Round to 2 decimal places
    taxRate,
    taxLabel,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    exemptAmount: Math.round(exemptAmount * 100) / 100,
    zeroRatedAmount: Math.round(zeroRatedAmount * 100) / 100,
  };
}

/**
 * Get applicable tax rate for a product
 */
export async function getProductTaxRate(
  tenantId: string,
  productId: string,
  productType: 'regular' | 'bundle' | 'service',
  categoryId?: string,
  region?: TaxRegion
): Promise<number> {
  const taxRules = await prisma.taxRule.findMany({
    where: { tenantId, isActive: true },
    orderBy: { priority: 'desc' },
    include: { categories: true, products: true },
  });

  if (taxRules.length > 0) {
    for (const rule of taxRules) {
      let applies = false;

      if (rule.appliesTo === 'all') {
        applies = true;
      } else if (rule.appliesTo === 'products' && (productType === 'regular' || productType === 'bundle')) {
        applies = true;
      } else if (rule.appliesTo === 'services' && productType === 'service') {
        applies = true;
      } else if (rule.appliesTo === 'categories' && categoryId) {
        applies = rule.categories.some((c) => c.categoryId === categoryId);
      }

      if (rule.products.length > 0) {
        applies = rule.products.some((p) => p.productId === productId);
      }

      if (applies && !ruleMatchesRegion(rule, region)) {
        applies = false;
      }

      if (applies) {
        return Number(rule.rate);
      }
    }
  }

  // Fall back to tenant settings
  const tenantSettings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (tenantSettings?.taxEnabled && tenantSettings.taxRate) {
    return Number(tenantSettings.taxRate);
  }

  return 0;
}
