/**
 * Shared tenant loader for automations.
 *
 * Loads only active tenants that match the job's feature filter, with a small
 * projection, in a single query. Jobs should use `tenant.settings` from the
 * result instead of re-reading it per tenant with getTenantSettingsById.
 */

import mongoose from 'mongoose';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';

export interface AutomationTenant {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  settings: ITenantSettings;
}

export interface GetAutomationTenantsOptions {
  /** Restrict to one tenant (manual / per-tenant trigger). `filter` is ignored. */
  tenantId?: string;
  /** Feature filter for scheduled runs, e.g. { 'settings.enableBookingScheduling': true }. */
  filter?: Record<string, unknown>;
  /** Projection; defaults to the fields in AutomationTenant. */
  select?: string;
}

export async function getAutomationTenants(
  options: GetAutomationTenantsOptions = {}
): Promise<AutomationTenant[]> {
  let query: Record<string, unknown>;
  if (options.tenantId) {
    if (!mongoose.Types.ObjectId.isValid(options.tenantId)) return [];
    query = { _id: new mongoose.Types.ObjectId(options.tenantId), isActive: true };
  } else {
    query = { isActive: true, ...options.filter };
  }
  return Tenant.find(query)
    .select(options.select ?? 'name slug settings')
    .lean<AutomationTenant[]>();
}
