/**
 * Regional Tax Rules
 * Handles multiple tax rates based on region, product type, category, etc.
 */

import { ITenantSettings } from '@/models/Tenant';

export interface TaxRule {
  id: string;
  name: string;
  rate: number;
  label: string;
  appliesTo?: 'all' | 'products' | 'services' | 'categories';
  categoryIds?: string[];
  productIds?: string[];
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCodes?: string[];
  };
  priority: number;
  isActive: boolean;
}

export interface TaxCalculationContext {
  productId?: string;
  categoryId?: string;
  productType?: 'product' | 'service';
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCode?: string;
  };
  subtotal: number;
}

/**
 * Calculate tax based on rules
 */
export function calculateTax(
  context: TaxCalculationContext,
  taxRules?: TaxRule[],
  defaultTaxRate?: number
): { amount: number; rate: number; label: string; appliedRules: TaxRule[] } {
  if (!taxRules || taxRules.length === 0) {
    // Fall back to default tax rate
    if (defaultTaxRate && defaultTaxRate > 0) {
      return {
        amount: (context.subtotal * defaultTaxRate) / 100,
        rate: defaultTaxRate,
        label: 'Tax',
        appliedRules: [],
      };
    }
    return {
      amount: 0,
      rate: 0,
      label: 'Tax',
      appliedRules: [],
    };
  }

  // Filter active rules
  const activeRules = taxRules.filter((rule) => rule.isActive);

  // Find applicable rules
  const applicableRules: TaxRule[] = [];

  for (const rule of activeRules) {
    if (isRuleApplicable(rule, context)) {
      applicableRules.push(rule);
    }
  }

  // Sort by priority (higher priority first)
  applicableRules.sort((a, b) => b.priority - a.priority);

  // Apply the highest priority rule (or combine if needed)
  // For simplicity, we'll use the highest priority rule
  // In a more complex system, you might combine multiple rules
  if (applicableRules.length > 0) {
    const rule = applicableRules[0];
    return {
      amount: (context.subtotal * rule.rate) / 100,
      rate: rule.rate,
      label: rule.label,
      appliedRules: [rule],
    };
  }

  // No applicable rule, use default
  if (defaultTaxRate && defaultTaxRate > 0) {
    return {
      amount: (context.subtotal * defaultTaxRate) / 100,
      rate: defaultTaxRate,
      label: 'Tax',
      appliedRules: [],
    };
  }

  return {
    amount: 0,
    rate: 0,
    label: 'Tax',
    appliedRules: [],
  };
}

/**
 * Check if a tax rule is applicable to the context
 */
function isRuleApplicable(rule: TaxRule, context: TaxCalculationContext): boolean {
  // Check appliesTo
  if (rule.appliesTo === 'products' && context.productType !== 'product') {
    return false;
  }
  if (rule.appliesTo === 'services' && context.productType !== 'service') {
    return false;
  }

  // Check category
  if (rule.appliesTo === 'categories' && rule.categoryIds) {
    if (!context.categoryId || !rule.categoryIds.includes(context.categoryId)) {
      return false;
    }
  }

  // Check product IDs
  if (rule.productIds && rule.productIds.length > 0) {
    if (!context.productId || !rule.productIds.includes(context.productId)) {
      return false;
    }
  }

  // Check region
  if (rule.region) {
    if (!context.region) {
      return false;
    }

    if (rule.region.country && context.region.country !== rule.region.country) {
      return false;
    }

    if (rule.region.state && context.region.state !== rule.region.state) {
      return false;
    }

    if (rule.region.city && context.region.city !== rule.region.city) {
      return false;
    }

    if (rule.region.zipCodes && rule.region.zipCodes.length > 0) {
      if (!context.region.zipCode || !rule.region.zipCodes.includes(context.region.zipCode)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculate tax for multiple items
 */
export function calculateTaxForItems(
  items: Array<{
    productId?: string;
    categoryId?: string;
    productType?: 'product' | 'service';
    subtotal: number;
  }>,
  taxRules?: TaxRule[],
  defaultTaxRate?: number,
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCode?: string;
  }
): { totalTax: number; itemTaxes: Array<{ itemIndex: number; tax: number; rate: number; label: string }> } {
  const itemTaxes: Array<{ itemIndex: number; tax: number; rate: number; label: string }> = [];
  let totalTax = 0;

  items.forEach((item, index) => {
    const context: TaxCalculationContext = {
      productId: item.productId,
      categoryId: item.categoryId,
      productType: item.productType,
      region,
      subtotal: item.subtotal,
    };

    const taxResult = calculateTax(context, taxRules, defaultTaxRate);
    itemTaxes.push({
      itemIndex: index,
      tax: taxResult.amount,
      rate: taxResult.rate,
      label: taxResult.label,
    });
    totalTax += taxResult.amount;
  });

  return { totalTax, itemTaxes };
}

/**
 * Get tax rules for a specific region
 */
export function getTaxRulesForRegion(
  region: {
    country?: string;
    state?: string;
    city?: string;
    zipCode?: string;
  },
  taxRules?: TaxRule[]
): TaxRule[] {
  if (!taxRules) {
    return [];
  }

  return taxRules.filter((rule) => {
    if (!rule.isActive) {
      return false;
    }

    if (!rule.region) {
      return true; // Rule applies to all regions
    }

    if (rule.region.country && region.country !== rule.region.country) {
      return false;
    }

    if (rule.region.state && region.state !== rule.region.state) {
      return false;
    }

    if (rule.region.city && region.city !== rule.region.city) {
      return false;
    }

    if (rule.region.zipCodes && rule.region.zipCodes.length > 0) {
      if (!region.zipCode || !rule.region.zipCodes.includes(region.zipCode)) {
        return false;
      }
    }

    return true;
  });
}
