/**
 * Laundry Order Pickup Reminders
 * Flags laundry orders that have been sitting in 'ready' status past a
 * threshold and notifies the customer, mirroring booking-no-show.ts's
 * loop-tenants -> query-time-window -> notify pattern.
 */

import prisma from '@/lib/db';
import { notifyOrderStatusChange } from '@/lib/notifications';
import { AutomationResult } from './types';

export interface LaundryReminderOptions {
  tenantId?: string;
  readyHoursThreshold?: number; // Hours in 'ready' status before reminding (default: 24)
}

/**
 * Send pickup reminders for laundry orders that have been ready too long
 */
export async function sendLaundryPickupReminders(
  options: LaundryReminderOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const readyHoursThreshold = options.readyHoursThreshold || 24;
    const now = new Date();
    const readyBefore = new Date(now.getTime() - readyHoursThreshold * 60 * 60 * 1000);

    let tenants;
    if (options.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalReminded = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        const pendingPickups = await prisma.laundryOrder.findMany({
          where: {
            tenantId,
            status: 'ready',
            isActive: true,
            readyAt: { lte: readyBefore },
          },
        });

        for (const order of pendingPickups) {
          try {
            await notifyOrderStatusChange(tenantId, order.customerId, {
              orderType: 'laundry',
              orderId: order.id,
              status: 'ready',
            });
            totalReminded++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Laundry order ${order.id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalReminded;
    results.failed = totalFailed;
    results.message = `Sent ${totalReminded} laundry pickup reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending laundry pickup reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
