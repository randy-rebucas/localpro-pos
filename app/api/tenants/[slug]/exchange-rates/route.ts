/**
 * Exchange Rates API
 * Handles fetching and updating exchange rates for multi-currency support
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { fetchExchangeRates } from '@/lib/multi-currency';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getTenantBySlugAny } from '@/lib/data/tenants';

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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const multiCurrency = settings.multiCurrency;
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

    // Check if user is admin or manager
    if (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { action } = body;

    logger.info(`Received exchange rate update request for tenant ${slug} with action: ${action}`);
    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (action === 'fetch') {
      // Fetch fresh rates from API
      const multiCurrency = existingSettings.multiCurrency;
      if (!multiCurrency?.enabled) {
        return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
      }
      if (!multiCurrency.displayCurrencies || multiCurrency.displayCurrencies.length === 0) {
        return NextResponse.json({ success: false, error: 'No display currencies configured' }, { status: 400 });
      }

      const baseCurrency = existingSettings.currency;
      if (!baseCurrency) {
        return NextResponse.json({ success: false, error: 'Base currency not set in tenant settings' }, { status: 400 });
      }

      const rates = await fetchExchangeRates(
        baseCurrency,
        multiCurrency.displayCurrencies,
        multiCurrency.exchangeRateApiKey
      );
      logger.info(`Fetched exchange rates for tenant ${slug}`);
      if (!rates) {
        logger.error(`Exchange rate fetch failed for tenant ${slug} (base: ${baseCurrency})`);
        return NextResponse.json(
          { success: false, error: 'Exchange rate provider unavailable. Try again later or enter rates manually.' },
          { status: 502 }
        );
      }

      const lastUpdated = new Date();
      const newMultiCurrency = {
        ...multiCurrency,
        exchangeRates: rates,
        lastUpdated,
      };
      const settings = { ...existingSettings, multiCurrency: newMultiCurrency };
      await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

      return NextResponse.json({
        success: true,
        data: { exchangeRates: rates, lastUpdated },
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

      const multiCurrency = existingSettings.multiCurrency;
      const lastUpdated = new Date();
      const newMultiCurrency = {
        ...(multiCurrency || { enabled: false }),
        exchangeRates,
        lastUpdated,
      };
      const settings = { ...existingSettings, multiCurrency: newMultiCurrency };
      await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

      return NextResponse.json({
        success: true,
        data: { exchangeRates, lastUpdated },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error updating exchange rates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
