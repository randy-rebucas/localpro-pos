import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { revokeToken } from '@/lib/token-blacklist';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    // Revoke the token so it cannot be reused even if intercepted
    const token = request.cookies.get('auth-token')?.value ||
                  request.headers.get('authorization')?.replace('Bearer ', '');
    if (token) {
      await revokeToken(token, 7 * 86400, 'logout'); // match JWT_EXPIRES_IN default
    }

    // super_admin has no tenantId — skip tenant-scoped audit log
    if (user && user.role !== 'super_admin') {
      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
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

