-- Prevent duplicate customer rows for the same phone number within a tenant
-- (customer OTP login does findFirst-then-create, which is a benign race
-- without this). NULLs are allowed to repeat (customers with no phone).
CREATE UNIQUE INDEX "customers_tenantId_phone_key"
  ON "customers" ("tenantId", "phone")
  WHERE ("phone" IS NOT NULL);
