import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import Category from '@/models/Category';

/**
 * GET - Universal search across products, services, stores, and categories
 * Query params: q (search query), type (products|services|stores|categories|all), tenantSlug
 * No authentication required
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all'; // products, services, stores, categories, all
    const tenantSlug = searchParams.get('tenantSlug') || '';

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Search query is required' },
        { status: 400 }
      );
    }

    let tenantId = null;
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ 
        slug: tenantSlug, 
        isActive: true 
      }).select('_id').lean();
      
      if (tenant) {
        tenantId = tenant._id;
      }
    }

    const results: { products: unknown[]; services: unknown[]; stores: unknown[]; categories: unknown[] } = {
      products: [],
      services: [],
      stores: [],
      categories: [],
    };

    // Search products
    if (type === 'all' || type === 'products') {
      const productQuery: Record<string, unknown> = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { sku: { $regex: query, $options: 'i' } },
        ],
        productType: { $ne: 'service' },
      };
      
      if (tenantId) {
        productQuery.tenantId = tenantId;
      }

      const products = await Product.find(productQuery)
        .populate('categoryId', 'name')
        .select('-branchStock')
        .limit(20)
        .lean();

      results.products = products.map((p: { _id: unknown; name: string; description?: string; price: number; image?: string; productType: string; categoryId?: unknown }) => ({
        _id: p._id,
        name: p.name,
        description: p.description,
        price: p.price,
        image: p.image,
        productType: p.productType,
        category: p.categoryId,
      }));
    }

    // Search services
    if (type === 'all' || type === 'services') {
      const serviceQuery: Record<string, unknown> = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { sku: { $regex: query, $options: 'i' } },
        ],
        productType: 'service',
      };
      
      if (tenantId) {
        serviceQuery.tenantId = tenantId;
      }

      const services = await Product.find(serviceQuery)
        .populate('categoryId', 'name')
        .select('-branchStock -stock')
        .limit(20)
        .lean();

      results.services = services.map((s: unknown) => ({
        _id: s._id,
        name: s.name,
        description: s.description,
        price: s.price,
        image: s.image,
        serviceDuration: s.serviceDuration,
        category: s.categoryId,
      }));
    }

    // Search stores
    if (type === 'all' || type === 'stores') {
      const storeQuery: Record<string, unknown> = {
        isActive: true,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { slug: { $regex: query, $options: 'i' } },
          { 'settings.companyName': { $regex: query, $options: 'i' } },
        ],
      };

      const stores = await Tenant.find(storeQuery)
        .select('name slug settings.companyName settings.logo')
        .limit(10)
        .lean();

      results.stores = stores.map((s: { _id: unknown; name: string; slug: string; settings?: { companyName?: string; logo?: string } }) => ({
        _id: s._id,
        name: s.name,
        slug: s.slug,
        companyName: s.settings?.companyName,
        logo: s.settings?.logo,
      }));
    }

    // Search categories
    if (type === 'all' || type === 'categories') {
      const categoryQuery: Record<string, unknown> = {
        name: { $regex: query, $options: 'i' },
      };
      
      if (tenantId) {
        categoryQuery.tenantId = tenantId;
      }

      const categories = await Category.find(categoryQuery)
        .select('name description image')
        .limit(10)
        .lean();

      results.categories = categories;
    }

    const totalCount = 
      results.products.length +
      results.services.length +
      results.stores.length +
      results.categories.length;

    return NextResponse.json({ 
      success: true, 
      data: results,
      query,
      totalCount,
    });
  } catch (error: unknown) {
    console.error('Error performing search:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Search failed' }, 
      { status: 500 }
    );
  }
}
