/**
 * Exchange Rates API
 * Handles fetching and updating exchange rates for multi-currency support
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.multiCurrency settings.currency' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const multiCurrency = tenant.settings?.multiCurrency;
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.multiCurrency settings.currency' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'fetch') {
      // Fetch fresh rates from API
      const multiCurrency = tenant.settings?.multiCurrency;
      if (!multiCurrency?.enabled) {
        return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
      }
      if (!multiCurrency.displayCurrencies || multiCurrency.displayCurrencies.length === 0) {
        return NextResponse.json({ success: false, error: 'No display currencies configured' }, { status: 400 });
      }

      const baseCurrency = tenant.settings?.currency;
      if (!baseCurrency) {
        return NextResponse.json({ success: false, error: 'Base currency not set in tenant settings' }, { status: 400 });
      }

      const rates = await fetchExchangeRates(
        baseCurrency,
        multiCurrency.displayCurrencies,
        multiCurrency.exchangeRateApiKey
      );
      console.log(`Fetched exchange rates for tenant ${slug}:`, rates);
      if (!rates) {
        logger.error(`Exchange rate fetch failed for tenant ${slug} (base: ${baseCurrency})`);
        return NextResponse.json(
          { success: false, error: 'Exchange rate provider unavailable. Try again later or enter rates manually.' },
          { status: 502 }
        );
      }

      const updated = await getRepos().tenants.update(tenant._id, {
        set: { 'settings.multiCurrency': { ...multiCurrency, exchangeRates: rates, lastUpdated: new Date() } },
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }

      await createAuditLog(request, {
        tenantId: tenant._id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant._id,
        changes: { source: 'api', exchangeRates: rates },
      });

      return NextResponse.json({
        success: true,
        data: { exchangeRates: rates, lastUpdated: new Date() },
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

      const multiCurrency = tenant.settings?.multiCurrency;
      const updated = await getRepos().tenants.update(tenant._id, {
        set: {
          'settings.multiCurrency': { ...(multiCurrency || { enabled: false }), exchangeRates, lastUpdated: new Date() },
        },
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }

      await createAuditLog(request, {
        tenantId: tenant._id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant._id,
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
