import { setBypassContext } from './tenant-context';

// Side-effect import for standalone scripts (scripts/*.ts, run via `tsx`,
// outside any HTTP request). Without this, every tenant-scoped table with an
// RLS policy (see prisma/migrations/*_add_rls_*) silently returns zero rows
// / affects zero rows for these scripts, since no `app.tenant_id` session
// variable is ever set outside a request. Import this first, before any
// Prisma call, in any new standalone script that touches tenant-scoped data.
setBypassContext();
