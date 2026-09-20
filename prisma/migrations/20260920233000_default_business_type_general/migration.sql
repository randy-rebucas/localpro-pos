-- AlterTable
ALTER TABLE "tenant_settings" ALTER COLUMN "businessType" SET DEFAULT 'general';

-- Backfill existing tenants that never had a business type set
UPDATE "tenant_settings" SET "businessType" = 'general' WHERE "businessType" IS NULL;
