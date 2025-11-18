import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITenant extends Document {
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  settings: {
    currency: string;
    timezone: string;
    language: 'en' | 'es';
    logo?: string;
    primaryColor?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
  {
    slug: {
      type: String,
      required: [true, 'Tenant slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
    },
    domain: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    settings: {
      currency: {
        type: String,
        default: 'USD',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      language: {
        type: String,
        enum: ['en', 'es'],
        default: 'en',
      },
      logo: String,
      primaryColor: {
        type: String,
        default: '#2563eb', // blue-600
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// No explicit indexes needed - unique: true on slug, subdomain, and domain automatically creates indexes

const Tenant: Model<ITenant> = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

export default Tenant;

