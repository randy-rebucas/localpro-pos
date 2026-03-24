# add-api-route

Create a new Next.js App Router API route following project conventions.

## Required pattern for every route handler

```typescript
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  // 1. Rate limit (auth/write routes)
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rl = checkRateLimit(`route-name:${ip}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });

  // 2. Auth
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  // 3. DB + tenant-scoped query (ALWAYS filter by user.tenantId)
  try {
    await connectDB();
    // ... query with { tenantId: user.tenantId }

    // 4. Audit log for mutations
    await createAuditLog(request, { action: 'CREATE', entityType: 'EntityName', tenantId: user.tenantId });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, 'Operation failed');
  }
}
```

## File location
- `app/api/{resource}/route.ts` — collection-level (GET all, POST)
- `app/api/{resource}/[id]/route.ts` — item-level (GET one, PUT, DELETE)

## Super-admin exception
Routes under `app/api/admin/` that are super_admin-only: skip tenantId filter, but add:
```typescript
if (user.role !== 'super_admin') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
```

## Verify after creation
1. `pnpm run lint`
2. `pnpm run build` — catches type errors in route exports
