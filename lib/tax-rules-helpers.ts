import type { TaxRule } from '@/hooks/useTaxRulesList';

export function getTaxRuleStatusColor(isActive: boolean): string {
  return isActive ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60';
}

export function formatTaxRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

export function formatRegionDisplay(rule: TaxRule): string {
  if (!rule.region) return '';

  const parts: string[] = [];
  if (rule.region.country) parts.push(rule.region.country);
  if (rule.region.state) parts.push(rule.region.state);
  if (rule.region.city) parts.push(rule.region.city);

  return parts.join(', ') || 'Any';
}

export function formatApplicableItemsDisplay(
  rule: TaxRule,
  t?: (key: string) => string
): string {
  const translate = t || ((key: string) => key);

  if (rule.appliesTo === 'all') return translate('admin.allProductsServices') || 'All Products & Services';
  if (rule.appliesTo === 'products') return translate('admin.productsOnly') || 'Products Only';
  if (rule.appliesTo === 'services') return translate('admin.servicesOnly') || 'Services Only';
  if (rule.appliesTo === 'categories') return translate('admin.specificCategories') || 'Specific Categories';

  return '';
}

export function getTaxRuleDetails(rule: TaxRule, t?: (key: string) => string): string[] {
  const details: string[] = [];

  details.push(`${formatTaxRate(rule.rate)} - ${rule.label}`);

  if (rule.appliesTo !== 'all') {
    details.push(`Applies to: ${formatApplicableItemsDisplay(rule, t)}`);
  }

  if (rule.region) {
    const regionDisplay = formatRegionDisplay(rule);
    details.push(`Region: ${regionDisplay}`);
  }

  details.push(`Priority: ${rule.priority}`);

  return details;
}

export function sortTaxRules(rules: TaxRule[]): TaxRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority);
}

export function getInactiveTaxRuleLabel(t?: (key: string) => string): string {
  const translate = t || ((key: string) => key);
  return translate('common.inactive') || 'Inactive';
}
