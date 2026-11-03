import dotenv from 'dotenv';
import { resolve } from 'path';
import { defineConfig } from 'drizzle-kit';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

// Migrations run over the direct connection (not PgBouncer) as pos_owner.
// See docs/postgres-migration.md and infra/postgres/README.md.
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT || 'postgres://pos:pos@localhost:5433/localpro_pos',
  },
  strict: true,
  verbose: true,
});
