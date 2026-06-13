import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import Tenant from '@/models/Tenant';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/stores
 *
 * Two modes:
 *
 * 1. Unauthenticated + ?slug=<tenantSlug>
 *    Returns the branches of that tenant so the mobile login screen can let
 *    users pick a store/branch before they have a token.
 *    Response: { success, data: { stores: [{ id, name, tenantId, branchId, address }] } }
 *
 * 2. Authenticated (Bearer token)
 *    Returns all active branches for the authenticated user's tenant.
 *    Same response shape.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`stores:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    await connectDB();

    let tenantId: string | null = null;

    // Try authenticated path first
    const user = await getCurrentUser(request).catch(() => null);
    if (user) {
      tenantId = user.tenantId;
    }

    // Fall back to ?slug= param for pre-login store picker
    if (!tenantId) {
      const slug = request.nextUrl.searchParams.get('slug');
      if (!slug) {
        return NextResponse.json(
          { success: false, error: 'Provide a tenant slug (?slug=) or a valid auth token' },
          { status: 400 }
        );
      }
      const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
      }
      tenantId = tenant._id.toString();
    }

    const branches = await Branch.find({ tenantId, isActive: true })
      .sort({ name: 1 })
      .lean();

    const stores = branches.map((b) => ({
      id: b._id.toString(),
      name: b.name,
      tenantId: b.tenantId.toString(),
      branchId: b._id.toString(),
      address: b.address
        ? [b.address.street, b.address.city, b.address.state]
            .filter(Boolean)
            .join(', ') || undefined
        : undefined,
    }));

    return NextResponse.json({ success: true, data: { stores } });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stores');
  }
}
