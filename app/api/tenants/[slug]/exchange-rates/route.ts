/**
 * Exchange Rates API
 * Handles fetching and updating exchange rates for multi-currency support
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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
    const tenant = await prisma.tenant.findFirst({
      where: { slug },
      include: { settings: true, exchangeRates: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!tenant.settings?.multiCurrencyEnabled) {
      return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
    }

    const exchangeRates: Record<string, number> = {};
    for (const r of tenant.exchangeRates) {
      exchangeRates[r.currencyCode] = Number(r.rate);
    }

    return NextResponse.json({
      success: true,
      data: {
        exchangeRates,
        lastUpdated: tenant.settings?.exchangeRateLastUpdated ?? null,
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

    const tenant = await prisma.tenant.findFirst({
      where: { slug },
      include: { settings: true, exchangeRates: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'settings.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const writeRates = async (rates: Record<string, number>) => {
      await prisma.$transaction(async (tx) => {
        for (const [currencyCode, rate] of Object.entries(rates)) {
          await tx.tenantExchangeRate.upsert({
            where: { tenantId_currencyCode: { tenantId: tenant.id, currencyCode } },
            create: { id: `${tenant.id}_xr_${currencyCode}`, tenantId: tenant.id, currencyCode, rate },
            update: { rate },
          });
        }
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, exchangeRateLastUpdated: new Date() },
          update: { exchangeRateLastUpdated: new Date() },
        });
      });
    };

    if (action === 'fetch') {
      // Fetch fresh rates from API
      if (!tenant.settings?.multiCurrencyEnabled) {
        return NextResponse.json({ success: false, error: 'Multi-currency not enabled' }, { status: 400 });
      }
      const displayCurrencies = tenant.settings.displayCurrencies || [];
      if (displayCurrencies.length === 0) {
        return NextResponse.json({ success: false, error: 'No display currencies configured' }, { status: 400 });
      }

      const baseCurrency = tenant.settings.currency;
      if (!baseCurrency) {
        return NextResponse.json({ success: false, error: 'Base currency not set in tenant settings' }, { status: 400 });
      }

      const rates = await fetchExchangeRates(
        baseCurrency,
        displayCurrencies,
        tenant.settings.exchangeRateApiKey ?? undefined
      );
      logger.info(`Fetched exchange rates for tenant ${slug}`, { rates });
      if (!rates) {
        logger.error(`Exchange rate fetch failed for tenant ${slug} (base: ${baseCurrency})`);
        return NextResponse.json(
          { success: false, error: 'Exchange rate provider unavailable. Try again later or enter rates manually.' },
          { status: 502 }
        );
      }

      await writeRates(rates as Record<string, number>);

      await createAuditLog(request, {
        tenantId: tenant.id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant.id,
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

      await writeRates(exchangeRates as Record<string, number>);

      await createAuditLog(request, {
        tenantId: tenant.id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'exchange_rates',
        entityId: tenant.id,
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
