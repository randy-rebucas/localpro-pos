import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    
    if (user) {
      await createAuditLog(request, {
        tenantId: user.tenantId,
        action: AuditActions.LOGOUT,
        entityType: 'user',
        entityId: user.userId,
        metadata: { success: true },
      });
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    response.cookies.delete('auth-token');
    
    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.logoutFailed', 'Logout failed') },
      { status: 500 }
    );
  }
}

