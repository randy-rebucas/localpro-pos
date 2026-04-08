import connectDB from '@/lib/mongodb';
import AutomationTrigger from '@/models/AutomationTrigger';
import Customer from '@/models/Customer';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { logger } from '@/lib/logger';

interface TriggerResult {
  triggerId: string;
  triggerName: string;
  customersReached: number;
  errors: number;
}

/**
 * Evaluates all active triggers for a tenant and fires notifications
 * for qualifying customers. Called by the cron route daily.
 */
export async function evaluateTriggers(tenantId: string): Promise<TriggerResult[]> {
  await connectDB();
  const results: TriggerResult[] = [];

  const triggers = await AutomationTrigger.find({ tenantId, isActive: true }).lean();
  if (triggers.length === 0) return results;

  const now = new Date();

  for (const trigger of triggers) {
    let customersReached = 0;
    let errors = 0;

    try {
      const customers = await getQualifyingCustomers(tenantId, trigger, now);

      for (const customer of customers) {
        const message = personalizeMessage(trigger.action.message, customer);
        const to = trigger.action.channel === 'email' ? customer.email : customer.phone;
        if (!to) continue;

        try {
          if (trigger.action.channel === 'email') {
            await sendEmail({
              to,
              subject: trigger.action.subject || trigger.name,
              message,
              type: 'email',
            });
          } else {
            await sendSMS({ to, message, type: 'sms' });
          }
          customersReached++;
        } catch (err) {
          logger.error(`Trigger [${trigger._id}] failed for customer [${customer._id}]`, err);
          errors++;
        }
      }

      // Update trigger stats
      await AutomationTrigger.findByIdAndUpdate(trigger._id, {
        lastRunAt: now,
        $inc: { totalFired: customersReached },
      });

      results.push({ triggerId: trigger._id.toString(), triggerName: trigger.name, customersReached, errors });
    } catch (err) {
      logger.error(`Trigger evaluation failed [${trigger._id}]`, err);
    }
  }

  return results;
}

async function getQualifyingCustomers(tenantId: string, trigger: any, now: Date) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const query: Record<string, unknown> = { tenantId, isActive: true };

  switch (trigger.event) {
    case 'birthday': {
      const daysAhead = trigger.conditions.daysBeforeBirthday ?? 3;
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      // Match customers whose birthday (month+day) falls on targetDate
      query['$expr'] = {
        $and: [
          { $eq: [{ $month: '$dateOfBirth' }, targetDate.getMonth() + 1] },
          { $eq: [{ $dayOfMonth: '$dateOfBirth' }, targetDate.getDate()] },
        ],
      };
      query.dateOfBirth = { $exists: true };
      break;
    }

    case 'inactivity_30d':
    case 'inactivity_60d':
    case 'inactivity_90d': {
      const days = trigger.conditions.inactivityDays ||
        (trigger.event === 'inactivity_30d' ? 30 : trigger.event === 'inactivity_60d' ? 60 : 90);
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      query.lastPurchaseDate = { $lt: cutoff };
      break;
    }

    case 'loyalty_milestone': {
      const threshold = trigger.conditions.loyaltyPointsThreshold ?? 100;
      query.loyaltyPointsBalance = { $gte: threshold };
      break;
    }

    case 'low_engagement': {
      query.engagementScore = { $exists: true, $lt: 30 };
      break;
    }

    default:
      return [];
  }

  return Customer.find(query).select('firstName lastName email phone dateOfBirth loyaltyPointsBalance').limit(500).lean();
}

function personalizeMessage(message: string, customer: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return message
    .replace(/{firstName}/g, customer.firstName || '')
    .replace(/{lastName}/g, customer.lastName || '')
    .replace(/{points}/g, String(customer.loyaltyPointsBalance || 0));
}
