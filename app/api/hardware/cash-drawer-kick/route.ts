import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import net from 'net';

/**
 * Server-side cash drawer kick via raw TCP to network printer.
 * Sends ESC/POS pulse command (ESC p 0 25 255) to the printer's IP:port.
 * The drawer must be connected to the printer via RJ11/RJ12 cable.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Get printer config from tenant settings
    const { getTenantSettingsById } = await import('@/lib/tenant');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = await getTenantSettingsById(tenantId) as any;

    const printerIp = settings?.hardwareConfig?.printer?.ipAddress;
    const printerPort = settings?.hardwareConfig?.printer?.portNumber || 9100;

    if (!printerIp) {
      return NextResponse.json(
        { success: false, error: 'No network printer configured. Set printer IP in Hardware Settings.' },
        { status: 400 }
      );
    }

    // ESC/POS command: open cash drawer (pulse pin 2)
    // ESC p m t1 t2 — m=0 (pin 2), t1=25 (on time), t2=255 (off time)
    const kickCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFF]);

    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      }, 5000);

      socket.connect(printerPort, printerIp, () => {
        socket.write(kickCommand, (err) => {
          clearTimeout(timeout);
          socket.end();
          if (err) reject(err);
          else resolve();
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return NextResponse.json({ success: true, message: 'Cash drawer kick sent' });
  } catch (error: unknown) {
    logger.error('Cash drawer kick failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to open cash drawer';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
