/**
 * Exchange Rates API
 * Handles fetching and updating exchange rates for multi-currency support
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { fetchExchangeRates } from '@/lib/multi-currency';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const multiCurrency = tenant.settings.multiCurrency;
    if (!multiCurrency?.enabled) {
      return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        exchangeRates: multiCurrency.exchangeRates || {},
        lastUpdated: multiCurrency.lastUpdated,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching exchange rates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { action } = body;

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'settings.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Outbound provider calls (and their API quota): a few per minute per store
    if (action === 'fetch') {
      const { allowed } = checkRateLimit(`exchange-rates:fetch:${tenant._id}`, 5, 60_000);
      if (!allowed) {
        return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
      }
    }

    if (action === 'fetch') {
      // Fetch fresh rates from API
      const multiCurrency = tenant.settings.multiCurrency;
      if (!multiCurrency?.enabled) {
        return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
      }
      if (!multiCurrency.displayCurrencies || multiCurrency.displayCurrencies.length === 0) {
        return NextResponse.json({ success: false, error: 'No display currencies configured' }, { status: 400 });
      }

      const baseCurrency = tenant.settings.currency;
      if (!baseCurrency) {
        return NextResponse.json({ success: false, error: 'Base currency not set in tenant settings' }, { status: 400 });
      }

      const rates = await fetchExchangeRates(
        baseCurrency,
        multiCurrency.displayCurrencies,
        multiCurrency.exchangeRateApiKey
      );
      if (!rates) {
        logger.error(`Exchange rate fetch failed for tenant ${slug} (base: ${baseCurrency})`);
        return NextResponse.json(
          { success: false, error: 'Exchange rate provider unavailable. Try again later or enter rates manually.' },
          { status: 502 }
        );
      }

      // Use toObject() so spreading a Mongoose subdocument works correctly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcObj = typeof (multiCurrency as any).toObject === 'function' ? (multiCurrency as any).toObject() : { ...multiCurrency };
      // Merge over the existing map: a rate entered by hand for a currency the
      // provider doesn't carry is kept instead of silently disappearing
      // (a Mongoose Map: spreading it directly would give {})
      const rawRates = mcObj.exchangeRates as unknown;
      const existingRates: Record<string, number> =
        rawRates instanceof Map ? Object.fromEntries(rawRates) : rawRates && typeof rawRates === 'object' ? (rawRates as Record<string, number>) : {};
      const merged = { ...existingRates, ...rates };
      tenant.settings.multiCurrency = {
        ...mcObj,
        exchangeRates: merged,
        lastUpdated: new Date(),
      };

      tenant.markModified('settings.multiCurrency');
      await tenant.save();

      await createAuditLog(request, {
        tenantId: tenant._id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant._id.toString(),
        changes: { source: 'api', exchangeRates: merged },
      });

      return NextResponse.json({
        success: true,
        data: { exchangeRates: merged, lastUpdated: new Date() },
      });
    } else if (action === 'update') {
      // Manually update rates
      const { exchangeRates } = body;
      if (!exchangeRates || typeof exchangeRates !== 'object' || Array.isArray(exchangeRates)) {
        return NextResponse.json({ success: false, error: 'Invalid exchange rates' }, { status: 400 });
      }

      // Validate each rate value is a positive number
      for (const [currency, rate] of Object.entries(exchangeRates)) {
        if (typeof rate !== 'number' || rate <= 0) {
          return NextResponse.json(
            { success: false, error: `Invalid rate for ${currency}: must be a positive number` },
            { status: 400 }
          );
        }
      }

      const multiCurrency = tenant.settings.multiCurrency;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcObj = multiCurrency && typeof (multiCurrency as any).toObject === 'function' ? (multiCurrency as any).toObject() : { ...(multiCurrency || { enabled: false }) };
      tenant.settings.multiCurrency = {
        ...mcObj,
        exchangeRates,
        lastUpdated: new Date(),
      };

      tenant.markModified('settings.multiCurrency');
      await tenant.save();

      await createAuditLog(request, {
        tenantId: tenant._id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant._id.toString(),
        changes: { source: 'manual', exchangeRates },
      });

      return NextResponse.json({
        success: true,
        data: { exchangeRates, lastUpdated: new Date() },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating exchange rates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
