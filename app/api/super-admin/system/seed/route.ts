import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const DEFAULT_PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses getting started.',
    priceMonthly: 0,
    priceSetupFee: 0,
    priceCurrency: 'PHP',
    maxUsers: 2,
    maxBranches: 1,
    maxProducts: 100,
    maxTransactions: 500,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: false,
    enableLoyaltyProgram: false,
    enableCustomerManagement: false,
    enableBookingScheduling: false,
    enableReports: true,
    enableMultiBranch: false,
    enableHardwareIntegration: false,
    prioritySupport: false,
    customIntegrations: false,
    dedicatedAccountManager: false,
    birPtuAssistance: false,
    birReceiptFormatting: false,
    birDocumentation: false,
    birCasReporting: false,
    birAuditTrailSystem: false,
    birMonthlySupport: false,
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'pro',
    name: 'Pro',
    description: 'For growing businesses that need more power.',
    priceMonthly: 999,
    priceSetupFee: 0,
    priceCurrency: 'PHP',
    maxUsers: 10,
    maxBranches: 3,
    maxProducts: 1000,
    maxTransactions: 5000,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: true,
    enableLoyaltyProgram: true,
    enableCustomerManagement: true,
    enableBookingScheduling: false,
    enableReports: true,
    enableMultiBranch: true,
    enableHardwareIntegration: true,
    prioritySupport: false,
    customIntegrations: false,
    dedicatedAccountManager: false,
    birPtuAssistance: true,
    birReceiptFormatting: true,
    birDocumentation: false,
    birCasReporting: false,
    birAuditTrailSystem: true,
    birMonthlySupport: false,
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'business',
    name: 'Business',
    description: 'For established businesses with full compliance needs.',
    priceMonthly: 2499,
    priceSetupFee: 0,
    priceCurrency: 'PHP',
    maxUsers: 50,
    maxBranches: 10,
    maxProducts: 10000,
    maxTransactions: 50000,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: true,
    enableLoyaltyProgram: true,
    enableCustomerManagement: true,
    enableBookingScheduling: true,
    enableReports: true,
    enableMultiBranch: true,
    enableHardwareIntegration: true,
    prioritySupport: true,
    customIntegrations: false,
    dedicatedAccountManager: false,
    birPtuAssistance: true,
    birReceiptFormatting: true,
    birDocumentation: true,
    birCasReporting: true,
    birAuditTrailSystem: true,
    birMonthlySupport: true,
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale with dedicated support.',
    priceMonthly: 9999,
    priceSetupFee: 0,
    priceCurrency: 'PHP',
    maxUsers: -1,
    maxBranches: -1,
    maxProducts: -1,
    maxTransactions: -1,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: true,
    enableLoyaltyProgram: true,
    enableCustomerManagement: true,
    enableBookingScheduling: true,
    enableReports: true,
    enableMultiBranch: true,
    enableHardwareIntegration: true,
    prioritySupport: true,
    customIntegrations: true,
    dedicatedAccountManager: true,
    birPtuAssistance: true,
    birReceiptFormatting: true,
    birDocumentation: true,
    birCasReporting: true,
    birAuditTrailSystem: true,
    birMonthlySupport: true,
    isActive: true,
    isCustom: false,
  },
];

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`super-admin-seed:${ip}`, 10, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const user = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { target } = body;

    if (!target || !['plans', 'all'].includes(target)) {
      return NextResponse.json(
        { success: false, error: "target must be 'plans' or 'all'" },
        { status: 400 }
      );
    }

    const seeded: string[] = [];

    if (target === 'plans' || target === 'all') {
      for (const planData of DEFAULT_PLANS) {
        const { tier, ...rest } = planData;
        await prisma.subscriptionPlan.upsert({
          where: { tier: tier as never },
          create: { id: randomUUID(), tier: tier as never, ...rest },
          update: { ...rest },
        });
        seeded.push(`plan:${tier}`);
      }
    }

    const defaultTenant = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
    if (defaultTenant) {
      await createAuditLog(request, {
        tenantId: defaultTenant.id,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'system_seed',
        entityId: target,
        changes: { seeded },
        metadata: { updatedBy: user.userId, role: 'super_admin' },
      });
    }

    return NextResponse.json({ success: true, seeded });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
