/**
 * Sample data page helper functions
 */

export const BIZ_TYPE_LABELS: Record<string, string> = {
  retail: 'Retail Store',
  restaurant: 'Restaurant / Food Service',
  laundry: 'Laundry Service',
  service: 'Service Business (Salon, Spa, etc.)',
  general: 'General Business',
};

export const BIZ_TYPE_COLORS: Record<string, string> = {
  retail: 'blue',
  restaurant: 'orange',
  laundry: 'cyan',
  service: 'purple',
  general: 'green',
};

export const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-brand-soft', border: 'border-teal-200', text: 'text-brand-hover', badge: 'bg-brand-soft text-brand-navy' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-800' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
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
