import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkFeatureAccess } from '@/lib/subscription';

/**
 * Ensures the tenant's subscription plan includes booking/scheduling and that
 * the store has it enabled (Settings → Business), using the same rules as
 * {@link supportsFeature} for the `booking` feature (tenant flag + business-type defaults).
 *
 * Use for **creating** or **actively managing** bookings (POST, customer flows, time slots,
 * reminders). List/read and soft-delete (cancel) routes stay usable when the feature is
 * off so staff can review history and close out records.
 */
export async function requireBookingSchedulingAccess(tenantId: string): Promise<void> {
  await checkFeatureAccess(tenantId, 'enableBookingScheduling');

  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'booking')) {
    throw new Error(
      'Booking and scheduling is turned off for this store. Enable it in Settings → Business Features.'
    );
  }
}
