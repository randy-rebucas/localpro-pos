import crypto from 'crypto';
import connectDB from './mongodb';
import Webhook, { WebhookEvent } from '@/models/Webhook';
import WebhookDelivery from '@/models/WebhookDelivery';
import { logger } from './logger';

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000]; // 1m, 5m, 15m

// Private/reserved IP ranges blocked to prevent SSRF
const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^169\.254\./,
];

/**
 * Validate a webhook URL — must be HTTPS and must not target private/reserved IPs.
 * Returns null if valid, or an error string if invalid.
 */
export function validateWebhookUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }
  if (parsed.protocol !== 'https:') {
    return 'Webhook URL must use HTTPS';
  }
  const host = parsed.hostname;
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(host)) {
      return 'Webhook URL must be a publicly accessible HTTPS endpoint';
    }
  }
  return null;
}

/**
 * Dispatch a webhook event to all active subscribers for the given tenantId.
 * Fire-and-forget: does not await delivery, queues retries on failure.
 */
export async function dispatchWebhook(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await connectDB();
    const hooks = await Webhook.find({ tenantId, isActive: true, events: event })
      .select('+secret')
      .lean();

    if (hooks.length === 0) return;

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      tenantId,
      data: payload,
    });

    await Promise.allSettled(
      hooks.map(hook => deliverWebhook(hook, event, body, payload, tenantId))
    );
  } catch (err) {
    logger.error('dispatchWebhook error', err);
  }
}

async function deliverWebhook(
  hook: { _id: unknown; url: string; secret: string },
  event: string,
  body: string,
  payload: Record<string, unknown>,
  tenantId: string
): Promise<void> {
  const deliveryDoc = await WebhookDelivery.create({
    webhookId: hook._id,
    tenantId,
    event,
    payload,
    status: 'pending',
    attempts: 0,
  });

  await attemptDelivery(hook, deliveryDoc._id.toString(), body);
}

export async function attemptDelivery(
  hook: { _id: unknown; url: string; secret: string },
  deliveryId: string,
  body?: string
): Promise<void> {
  const delivery = await WebhookDelivery.findById(deliveryId);
  if (!delivery) return;

  if (!body) {
    body = JSON.stringify({
      event: delivery.event,
      timestamp: delivery.createdAt.toISOString(),
      tenantId: delivery.tenantId,
      data: delivery.payload,
    });
  }

  const signature = crypto
    .createHmac('sha256', hook.secret)
    .update(body)
    .digest('hex');

  delivery.attempts += 1;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': deliveryId,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      delivery.status = 'success';
      delivery.responseCode = response.status;
      delivery.responseBody = responseBody.slice(0, 2000);
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = undefined;

      await Webhook.findByIdAndUpdate(hook._id, {
        lastDeliveryAt: new Date(),
        failureCount: 0,
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${responseBody.slice(0, 200)}`);
    }
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const errMessage = err.message || 'Unknown error';
    delivery.error = errMessage.slice(0, 500);
    delivery.responseCode = undefined;

    if (delivery.attempts <= MAX_RETRIES) {
      delivery.status = 'retrying';
      delivery.nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[delivery.attempts - 1]);
    } else {
      delivery.status = 'failed';
      delivery.nextRetryAt = undefined;
      await Webhook.findByIdAndUpdate(hook._id, { $inc: { failureCount: 1 } });
    }

    logger.error(`Webhook delivery failed [${deliveryId}]`, { error: errMessage, attempt: delivery.attempts });
  }

  await delivery.save();
}

/**
 * Retry all pending/retrying webhook deliveries that are due.
 * Called by the cron automation route.
 */
export async function retryPendingDeliveries(): Promise<{ retried: number; failed: number }> {
  await connectDB();
  const due = await WebhookDelivery.find({
    status: 'retrying',
    nextRetryAt: { $lte: new Date() },
    attempts: { $lte: MAX_RETRIES },
  }).limit(100);

  let retried = 0;
  let failed = 0;

  for (const delivery of due) {
    const hook = await Webhook.findById(delivery.webhookId).select('+secret').lean();
    if (!hook) {
      delivery.status = 'failed';
      await delivery.save();
      failed++;
      continue;
    }
    await attemptDelivery(hook, delivery._id.toString());
    const updated = await WebhookDelivery.findById(delivery._id);
    if (updated?.status === 'success') retried++;
    else failed++;
  }

  return { retried, failed };
}
