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

// Solid Win8 badge fills (white text) per business type.
export const BIZ_TYPE_BADGE: Record<string, string> = {
  retail: 'bg-brand text-white',
  restaurant: 'bg-win8-suspended text-white',
  laundry: 'bg-win8-info text-white',
  service: 'bg-win8-accent text-white',
  general: 'bg-win8-success text-white',
};

export function getBusinessTypeLabel(bizType: string): string {
  return BIZ_TYPE_LABELS[bizType] ?? bizType;
}

export function getBusinessTypeBadge(bizType: string): string {
  return BIZ_TYPE_BADGE[bizType] ?? 'bg-gray-500 text-white';
}
