import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * Server-Sent Events endpoint for real-time stock tracking
 * Clients can subscribe to stock updates for specific products or all products
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return new Response(t('validation.tenantNotFound', 'Tenant not found'), { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');
    const branchId = searchParams.get('branchId');

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection message
        const send = (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const t = await getValidationTranslatorFromRequest(request);
        send({ type: 'connected', message: t('validation.realtimeStockConnected', 'Real-time stock tracking connected') });

        // Poll for stock movements (more reliable than change streams)
        let lastCheck = new Date();
        
        const pollInterval = setInterval(async () => {
          try {
            const query: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
              tenantId,
              createdAt: { $gt: lastCheck },
            };
            
            if (productId) {
              query.productId = productId;
            }
            
            if (branchId) {
              query.branchId = branchId;
            }

            const recentMovements = await StockMovement.find(query)
              .sort({ createdAt: -1 })
              .limit(50)
              .lean();

            for (const movement of recentMovements) {
              const product = await Product.findById(movement.productId).lean();
              if (product) {
                send({
                  type: 'stock_update',
                  productId: movement.productId,
                  branchId: movement.branchId,
                  variation: movement.variation,
                  movementType: movement.type,
                  quantity: movement.quantity,
                  newStock: movement.newStock,
                  previousStock: movement.previousStock,
                  timestamp: movement.createdAt,
                });
              }
            }

            if (recentMovements.length > 0) {
              lastCheck = recentMovements[0].createdAt;
            }
          } catch (error) {
            console.error('Error polling stock movements:', error);
            send({ type: 'error', message: t('validation.pollingError', 'Polling error') });
          }
        }, 2000); // Poll every 2 seconds

        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
          send({ type: 'heartbeat', timestamp: new Date().toISOString() });
        }, 30000); // Every 30 seconds

        // Cleanup on close
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
    console.error('Error setting up real-time stock tracking:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return new Response(t('validation.internalServerError', 'Internal server error'), { status: 500 });
  }
}

