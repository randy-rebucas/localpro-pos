/**
 * Sample data page helper functions
 */

export const BIZ_TYPE_LABELS: Record<string, string> = {
  retail: 'Retail Store',
  general: 'General Business',
};

export const BIZ_TYPE_COLORS: Record<string, string> = {
  retail: 'blue',
  general: 'green',
};

export const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-brand-soft', border: 'border-teal-200', text: 'text-brand-hover', badge: 'bg-brand-soft text-brand-navy' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
};

export function getBusinessTypeLabel(bizType: string): string {
  return BIZ_TYPE_LABELS[bizType] ?? bizType;
}

export function getBusinessTypeColor(bizType: string): string {
  return BIZ_TYPE_COLORS[bizType] ?? 'blue';
}

export function getColorStyles(colorKey: string): (typeof COLOR_MAP)[keyof typeof COLOR_MAP] {
  return COLOR_MAP[colorKey] || COLOR_MAP.blue;
}
