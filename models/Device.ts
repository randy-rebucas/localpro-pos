import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A registered physical POS terminal/device (tablet, PC, etc.) for BYOD-style
 * SaaS deployments. BIR (RMO No. 24-2023) requires each hardware device used
 * with an accredited SaaS POS to be individually identified — Accreditation
 * Number (software) + Machine Serial Number (this device) + Terminal ID must
 * be traceable on every printed invoice.
 */
export interface IDevice extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  label: string; // e.g. "Front Counter iPad"
  serialNumber: string; // hardware serial number of the physical device
  terminalId: string; // short human-facing terminal code, e.g. "T-01"
  ptuNumber?: string; // Permit to Use / Acknowledgement Certificate number issued for this device
  ptuStatus: 'pending' | 'approved';
  isActive: boolean;
  registeredBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
    },
    label: {
      type: String,
      required: [true, 'Device label is required'],
      trim: true,
    },
    serialNumber: {
      type: String,
      required: [true, 'Serial number is required'],
      trim: true,
    },
    terminalId: {
      type: String,
      required: [true, 'Terminal ID is required'],
      trim: true,
    },
    ptuNumber: {
      type: String,
      trim: true,
    },
    ptuStatus: {
      type: String,
      enum: ['pending', 'approved'],
      default: 'pending',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    registeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Terminal ID and serial number must be unique per tenant so receipts unambiguously identify a device.
DeviceSchema.index({ tenantId: 1, terminalId: 1 }, { unique: true });
DeviceSchema.index({ tenantId: 1, serialNumber: 1 }, { unique: true });
DeviceSchema.index({ tenantId: 1, isActive: 1 });

const Device: Model<IDevice> = mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema);

export default Device;
