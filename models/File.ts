import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    // What the file is for; also its Cloudinary sub-folder: 1pos/{slug}/{assetType}/
    assetType: {
      type: String,
      enum: ['products', 'branding', 'files'],
      default: 'files',
    },
    // Cloudinary resource type (image | video | raw) — needed to delete the
    // right asset; non-image uploads (CSV, XLSX) are stored as raw.
    resourceType: {
      type: String,
      enum: ['image', 'video', 'raw'],
      default: 'image',
    },
    // Folder the asset was stored in, so ownership checks on delete still hold
    // if the tenant slug changes later. Absent on legacy uploads (tenants/{id}/).
    folder: {
      type: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'files',
  }
);

// Compound index for tenant + date range queries
FileSchema.index({ tenantId: 1, uploadedAt: -1 });
// Library/picker listings filtered by purpose (e.g. product image picker)
FileSchema.index({ tenantId: 1, assetType: 1, uploadedAt: -1 });

export type FileDocument = mongoose.Document & {
  tenantId: string;
  name: string;
  filename: string;
  size: number;
  type: string;
  url: string;
  assetType?: 'products' | 'branding' | 'files';
  resourceType?: 'image' | 'video' | 'raw';
  folder?: string;
  uploadedBy: string;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export default mongoose.models.File || mongoose.model<FileDocument>('File', FileSchema);
