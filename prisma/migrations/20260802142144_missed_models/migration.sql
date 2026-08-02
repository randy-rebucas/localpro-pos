-- CreateEnum
CREATE TYPE "pos_session_payment_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "counters" (
    "counter_key" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("counter_key")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "token_hash" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'logout',
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "user_revocations" (
    "user_id" UUID NOT NULL,
    "revoked_before" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_revocations_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "session_id" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "cart" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" JSONB,
    "tax_amount" DECIMAL(12,2),
    "tax_rate" DECIMAL(6,3),
    "tax_label" TEXT,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT,
    "payment_status" "pos_session_payment_status" NOT NULL DEFAULT 'pending',
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "revoked_tokens_expires_at_idx" ON "revoked_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "user_revocations" ADD CONSTRAINT "user_revocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
