import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getProductPerformance } from '@/lib/analytics';
import Product from '@/models/Product'; // Ensure Product model is registered
import Transaction from '@/models/Transaction'; // Ensure Transaction model is registered
import mongoose from 'mongoose';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Ensure models are registered by checking mongoose.models
    // This is necessary for populate to work in Next.js serverless functions
    // Accessing the models ensures their registration code has executed
    if (!mongoose.models.Product) {
      // Force model registration by accessing the model's modelName property
      // This ensures the Product module's registration code has run
      const _productName = Product.modelName;
    }
    if (!mongoose.models.Transaction) {
      // Force model registration by accessing the model's modelName property
      const _transactionName = Transaction.modelName;
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date();
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const performance = await getProductPerformance(tenantId, startDate, endDate, limit);

    return NextResponse.json({ success: true, data: performance });
  } catch (error: any) {
    console.error('Error fetching product performance:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

