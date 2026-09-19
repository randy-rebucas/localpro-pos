import mongoose, { Schema, Document, Model } from 'mongoose';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export interface ITenantEcommerceIntegration extends Document {
  tenantId: mongoose.Types.ObjectId;
  provider: EcommerceProvider;
  /** Shopify: myshop.myshopify.com */
  shopDomain?: string;
  /** WooCommerce: https://example.com (no trailing slash) */
  siteUrl?: string;
  /** AES-GCM blob from encryptCredentialsPayload */
  credentialsEncrypted: string;
  /** Woo webhook signing secret (encrypted) */
  webhookSecretEncrypted?: string;
  /** Shopify Admin API scopes granted */
  scopes?: string[];
  /** Shopify default inventory location */
  shopifyLocationId?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  lastError?: string;
  /** Optional branch for stock when pushing from POS */
  defaultBranchId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TenantEcommerceIntegrationSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['shopify', 'woocommerce'],
      required: true,
    },
    shopDomain: { type: String, trim: true, lowercase: true },
    siteUrl: { type: String, trim: true },
    credentialsEncrypted: { type: String, required: true },
    webhookSecretEncrypted: { type: String },
    scopes: [{ type: String }],
    shopifyLocationId: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    lastSyncAt: { type: Date },
    lastError: { type: String, trim: true },
    defaultBranchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

TenantEcommerceIntegrationSchema.index({ tenantId: 1, provider: 1 }, { unique: true });
TenantEcommerceIntegrationSchema.index({ shopDomain: 1 }, { sparse: true });
TenantEcommerceIntegrationSchema.index({ siteUrl: 1, tenantId: 1 }, { sparse: true });

const TenantEcommerceIntegration: Model<ITenantEcommerceIntegration> =
  mongoose.models.TenantEcommerceIntegration ||
  mongoose.model<ITenantEcommerceIntegration>('TenantEcommerceIntegration', TenantEcommerceIntegrationSchema);

export default TenantEcommerceIntegration;
