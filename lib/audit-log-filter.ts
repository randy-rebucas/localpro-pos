import { tenantDayEdge } from '@/lib/timezone';

/**
 * The audit log query both the journal list and its export run, built from the same
 * search params (action, entityType, userId, startDate, endDate) so an export prints
 * exactly what the page shows. Always scoped to the tenant.
 *
 * Dates are store days ('YYYY-MM-DD') read in the tenant's zone: from the first moment of
 * the start day to the last moment of the end day. A missing edge falls back to
 * `defaults` when given (the export uses the last 30 days up to now), else stays open.
 */
export type AuditLogQueryResult =
  | { ok: true; query: AuditLogQuery; start?: Date; end?: Date }
  /** `invalidDate`: a date that does not parse. `noMatch`: a filter that can match nothing (a malformed user id). */
  | { ok: false; reason: 'invalidDate' | 'noMatch' };

export interface AuditLogQuery {
  tenantId: string;
  action?: string;
  entityType?: string;
  userId?: string;
  createdAt?: { $gte?: Date; $lte?: Date };
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export function buildAuditLogQuery(
  params: URLSearchParams,
  tenantId: string,
  timeZone: string,
  defaults: { start?: Date; end?: Date } = {}
): AuditLogQueryResult {
  const query: AuditLogQuery = { tenantId: String(tenantId) };

  const action = params.get('action')?.trim();
  if (action) query.action = action;

  const entityType = params.get('entityType')?.trim();
  if (entityType) query.entityType = entityType.toLowerCase();

  const userId = params.get('userId')?.trim();
  if (userId) {
    // Not an ObjectId: it matches nobody (passing it on used to throw a CastError and a 500).
    if (!OBJECT_ID.test(userId)) return { ok: false, reason: 'noMatch' };
    query.userId = userId;
  }

  const startParam = params.get('startDate')?.trim();
  const endParam = params.get('endDate')?.trim();
  const start = startParam ? tenantDayEdge(startParam, 'start', timeZone) : defaults.start;
  const end = endParam ? tenantDayEdge(endParam, 'end', timeZone) : defaults.end;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return { ok: false, reason: 'invalidDate' };
  }
  if (start || end) {
    query.createdAt = {};
    if (start) query.createdAt.$gte = start;
    if (end) query.createdAt.$lte = end;
  }

  return { ok: true, query, start, end };
}

/** Whether the list needs the tenant's time zone (only when a date filter is set). */
export function auditQueryNeedsTimeZone(params: URLSearchParams): boolean {
  return !!(params.get('startDate')?.trim() || params.get('endDate')?.trim());
}
