import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { serializeExpense } from '@/lib/data/expenses';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const name = searchParams.get('name');

    const where: Prisma.ExpenseWhereInput = { tenantId, isActive: true };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    if (name) {
      where.name = name;
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({ success: true, data: expenses.map(serializeExpense) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch expenses');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    const userId = user.userId;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'expenses.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { name, description, amount, date, paymentMethod, receipt, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.expenseNameRequired', 'Name of expense is required') },
        { status: 400 }
      );
    }

    if (!description || !description.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.descriptionRequired', 'Description is required') },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null || amount === '') {
      return NextResponse.json(
        { success: false, error: t('validation.amountRequired', 'Amount is required') },
        { status: 400 }
      );
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue < 0) {
      return NextResponse.json(
        { success: false, error: t('validation.amountPositive', 'Amount must be a valid positive number') },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.create({
      data: {
        tenantId,
        name: name.trim(),
        description: description.trim(),
        amount: amountValue,
        date: date ? new Date(date) : new Date(),
        paymentMethod: paymentMethod || 'cash',
        receipt: receipt?.trim() || undefined,
        notes: notes?.trim() || undefined,
        userId,
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.CREATE,
      entityType: 'expense',
      entityId: expense.id,
      changes: { name, description, amount },
    });

    return NextResponse.json({ success: true, data: serializeExpense(expense) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create expense');
  }
}
