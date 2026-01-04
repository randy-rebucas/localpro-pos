/**
 * Exchange Rates API
 * Handles fetching and updating exchange rates for multi-currency support
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { fetchExchangeRates } from '@/lib/multi-currency';
import { getCurrentUser } from '@/lib/auth';

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
  } catch (error: unknown) {
    console.error('Error fetching exchange rates:', error);
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
    if (user.role !== 'admin' && user.role !== 'manager') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { action } = body;

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (action === 'fetch') {
      // Fetch fresh rates from API
      const multiCurrency = tenant.settings.multiCurrency;
      if (!multiCurrency?.enabled || !multiCurrency.displayCurrencies) {
        return NextResponse.json({ success: false, error: 'Multi-currency not configured' }, { status: 400 });
      }

      const baseCurrency = tenant.settings.currency;
      const rates = await fetchExchangeRates(
        baseCurrency,
        multiCurrency.displayCurrencies,
        multiCurrency.exchangeRateApiKey
      );

      if (!rates) {
        return NextResponse.json({ success: false, error: 'Failed to fetch exchange rates' }, { status: 500 });
      }

      // Update tenant settings
      tenant.settings.multiCurrency = {
        ...multiCurrency,
        exchangeRates: rates as Record<string, number>,
        lastUpdated: new Date(),
      };

      tenant.markModified('settings.multiCurrency');
      await tenant.save();

      return NextResponse.json({
        success: true,
        data: {
          exchangeRates: rates,
          lastUpdated: new Date(),
        },
      });
    } else if (action === 'update') {
      // Manually update rates
      const { exchangeRates } = body;
      if (!exchangeRates || typeof exchangeRates !== 'object') {
        return NextResponse.json({ success: false, error: 'Invalid exchange rates' }, { status: 400 });
      }

      const multiCurrency = tenant.settings.multiCurrency || { enabled: false };
      tenant.settings.multiCurrency = {
        ...multiCurrency,
        exchangeRates: exchangeRates as Record<string, number>,
        lastUpdated: new Date(),
      };

      tenant.markModified('settings.multiCurrency');
      await tenant.save();

      return NextResponse.json({
        success: true,
        data: {
          exchangeRates,
          lastUpdated: new Date(),
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error updating exchange rates:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
