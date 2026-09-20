import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * Server-Sent Events endpoint for real-time Kitchen Display updates.
 * Mirrors the poll-based SSE pattern used by app/api/inventory/realtime/route.ts.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return new Response(t('validation.tenantNotFound', 'Tenant not found'), { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId');

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const send = (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const t = await getValidationTranslatorFromRequest(request);
        send({ type: 'connected', message: t('validation.realtimeKitchenConnected', 'Real-time kitchen display connected') });

        let lastCheck = new Date();

        const pollInterval = setInterval(async () => {
          try {
            const ticketWhere: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (branchId) ticketWhere.branchId = branchId;

            const ticketIds = branchId
              ? (
                  await prisma.kitchenTicket.findMany({
                    where: ticketWhere,
                    select: { id: true },
                  })
                ).map((tkt) => tkt.id)
              : null;

            const where: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
              tenantId,
              updatedAt: { gt: lastCheck },
            };
            if (ticketIds) where.kitchenTicketId = { in: ticketIds };

            const recentItems = await prisma.kitchenTicketItem.findMany({
              where,
              orderBy: { updatedAt: 'desc' },
              take: 50,
              include: {
                transactionItem: { select: { id: true, name: true, quantity: true, price: true } },
              },
            });

            if (recentItems.length > 0) {
              for (const item of recentItems) {
                send({
                  type: 'kitchen_item_update',
                  kitchenTicketId: item.kitchenTicketId,
                  itemId: item.id,
                  status: item.status,
                  station: item.station,
                  startedAt: item.startedAt,
                  readyAt: item.readyAt,
                  servedAt: item.servedAt,
                  transactionItem: item.transactionItem,
                  timestamp: item.updatedAt,
                });
              }

              lastCheck = recentItems[0].updatedAt;
            }
          } catch (error) {
            logger.error('Error polling kitchen ticket items:', error);
            send({ type: 'error', message: t('validation.pollingError', 'Polling error') });
          }
        }, 5000); // Poll every 5 seconds

        const heartbeat = setInterval(() => {
          send({ type: 'heartbeat', timestamp: new Date().toISOString() });
        }, 30000); // Every 30 seconds

        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          clearInterval(pollInterval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable buffering in nginx
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error setting up real-time kitchen display:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return new Response(t('validation.internalServerError', 'Internal server error'), { status: 500 });
  }
}
