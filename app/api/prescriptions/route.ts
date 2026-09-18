import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Prisma.PrescriptionWhereInput = { tenantId: user.tenantId };
    if (status) where.status = status as Prisma.EnumPrescriptionStatusFilter['equals'];
    if (search) {
      where.OR = [
        { patientName: { contains: search, mode: 'insensitive' } },
        { doctorName: { contains: search, mode: 'insensitive' } },
        { prescriptionNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
      }),
      prisma.prescription.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: prescriptions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch prescriptions');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'prescriptions.create'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`prescriptions:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { patientName, patientAge, doctorName, doctorPRCNumber, doctorClinic, issuedDate, validUntil, items, notes, scannedCopy } = body;

    if (!patientName || !doctorName || !doctorPRCNumber || !issuedDate || !validUntil || !items?.length) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Generate prescription number: RX-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const lastRx = await prisma.prescription.findFirst({
      where: { tenantId: user.tenantId, prescriptionNumber: { startsWith: `RX-${year}-` } },
      orderBy: { prescriptionNumber: 'desc' },
      select: { prescriptionNumber: true },
    });

    let seq = 1;
    if (lastRx) {
      const parts = lastRx.prescriptionNumber.split('-');
      seq = (parseInt(parts[2], 10) || 0) + 1;
    }
    const prescriptionNumber = `RX-${year}-${String(seq).padStart(6, '0')}`;

    const prescription = await prisma.prescription.create({
      data: {
        id: randomUUID(),
        tenantId: user.tenantId,
        prescriptionNumber,
        patientName,
        patientAge,
        doctorName,
        doctorPRCNumber,
        doctorClinic,
        issuedDate: new Date(issuedDate),
        validUntil: new Date(validUntil),
        notes,
        scannedCopy,
        createdById: user.userId,
        items: {
          create: items.map((item: { productId?: string; drugName: string; quantity: number; dosage: string; frequency: string; instructions?: string }) => ({
            id: randomUUID(),
            productId: item.productId,
            drugName: item.drugName,
            quantity: item.quantity,
            dosage: item.dosage,
            frequency: item.frequency,
            instructions: item.instructions,
          })),
        },
      },
      include: { items: true },
    });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_CREATE,
      entityType: 'prescription',
      entityId: prescription.id,
      changes: { prescriptionNumber, patientName, doctorName },
    });

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to create prescription');
  }
}
