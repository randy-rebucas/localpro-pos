import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const filter: Record<string, unknown> = { tenantId: user.tenantId };
    if (status) filter.status = status;
    if (search) filter.$text = { $search: search };

    const [prescriptions, total] = await Promise.all([
      Prescription.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Prescription.countDocuments(filter),
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

    if (!['owner', 'admin', 'manager', 'cashier'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`prescriptions:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    await connectDB();

    const body = await request.json();
    const { patientName, patientAge, doctorName, doctorPRCNumber, doctorClinic, issuedDate, validUntil, items, notes, scannedCopy } = body;

    if (!patientName || !doctorName || !doctorPRCNumber || !issuedDate || !validUntil || !items?.length) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Generate prescription number: RX-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const lastRx = await Prescription.findOne(
      { tenantId: user.tenantId, prescriptionNumber: new RegExp(`^RX-${year}-`) },
      { prescriptionNumber: 1 },
      { sort: { prescriptionNumber: -1 } }
    ).lean();

    let seq = 1;
    if (lastRx) {
      const parts = lastRx.prescriptionNumber.split('-');
      seq = (parseInt(parts[2], 10) || 0) + 1;
    }
    const prescriptionNumber = `RX-${year}-${String(seq).padStart(6, '0')}`;

    const prescription = await Prescription.create({
      tenantId: user.tenantId,
      prescriptionNumber,
      patientName,
      patientAge,
      doctorName,
      doctorPRCNumber,
      doctorClinic,
      issuedDate: new Date(issuedDate),
      validUntil: new Date(validUntil),
      items,
      notes,
      scannedCopy,
      createdBy: user.userId,
    });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_CREATE,
      entityType: 'prescription',
      entityId: prescription._id.toString(),
      changes: { prescriptionNumber, patientName, doctorName },
    });

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to create prescription');
  }
}
