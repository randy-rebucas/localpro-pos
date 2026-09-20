-- Terminals (devices) must always belong to a branch: Business -> Branch ->
-- Terminal is the intended hierarchy end-to-end (Tenant -> Branch -> Device).
-- Table is currently empty in all known environments, so no backfill is
-- required; if a deployment does have null-branch rows, assign them to a
-- branch before applying this migration.

ALTER TABLE "devices" ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "devices" DROP CONSTRAINT "devices_branchId_fkey";
ALTER TABLE "devices" ADD CONSTRAINT "devices_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
