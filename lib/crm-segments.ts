/**
 * CRM segment rules, shared by the segments list (/api/crm/segments) and the
 * campaign send route — so the customers who receive a segment's campaign are
 * exactly the ones the admin saw in that segment when composing it.
 *
 * Every customer belongs to exactly one segment; the checks run in order.
 */

export const VIP_SPEND_THRESHOLD = 5000;
export const VIP_ORDERS_THRESHOLD = 20;
export const VIP_POINTS_THRESHOLD = 500;
export const LAPSED_DAYS = 90;
export const AT_RISK_DAYS = 30;

export const CRM_SEGMENTS = ['prospect', 'lapsed', 'at_risk', 'vip', 'new', 'regular'] as const;
export type CrmSegment = (typeof CRM_SEGMENTS)[number];

export interface SegmentStats {
  /** Completed sales with this customer attached */
  orderCount: number;
  /** Sum of those sales' totals (not the stored Customer.totalSpent) */
  totalSpent: number;
}

export function classifyCustomerSegment(
  customer: { lastPurchaseDate?: Date | string | null; loyaltyPointsBalance?: number | null },
  stats: SegmentStats | undefined,
  now: Date = new Date()
): CrmSegment {
  const orderCount = stats?.orderCount ?? 0;
  const totalSpent = stats?.totalSpent ?? 0;
  const points = customer.loyaltyPointsBalance ?? 0;
  const lastBuy = customer.lastPurchaseDate ? new Date(customer.lastPurchaseDate) : null;
  const lapsedCutoff = now.getTime() - LAPSED_DAYS * 86400000;
  const atRiskCutoff = now.getTime() - AT_RISK_DAYS * 86400000;

  if (orderCount === 0) return 'prospect';
  if (lastBuy && lastBuy.getTime() < lapsedCutoff) return 'lapsed';
  if (lastBuy && lastBuy.getTime() < atRiskCutoff && orderCount < 5) return 'at_risk';
  if (totalSpent >= VIP_SPEND_THRESHOLD || points >= VIP_POINTS_THRESHOLD || orderCount >= VIP_ORDERS_THRESHOLD) return 'vip';
  if (orderCount <= 2) return 'new';
  return 'regular';
}

/** Whether a customer is in `segment` ('all' takes everyone). */
export function isInSegment(
  segment: string,
  customer: Parameters<typeof classifyCustomerSegment>[0],
  stats: SegmentStats | undefined,
  now?: Date
): boolean {
  return segment === 'all' || classifyCustomerSegment(customer, stats, now) === segment;
}
