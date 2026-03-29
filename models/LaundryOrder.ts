import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILaundryItemModifiers {
  starchLevel?: 'none' | 'light' | 'heavy';
  finish?: 'folded' | 'hangered';
  stainTreatment?: boolean;
  notes?: string;
}

export interface ILaundryOrderItem {
  serviceId: string;
  serviceName: string;
  unitPrice: number;
  quantity: number;
  weight?: number; // kg — for wash & fold
  subtotal: number;
  modifiers: ILaundryItemModifiers;
  tagId?: string; // heat-seal tag ID
}

export interface ILaundryOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  items: ILaundryOrderItem[];
  subtotal: number;
  total: number;
  status: 'inbasket' | 'processing' | 'ready' | 'picked_up';
  rackLocation?: string;
  readyBy: Date;
  paymentMethod?: 'cash' | 'card' | 'tap_to_pay' | 'digital_wallet' | 'qr_code';
  paymentStatus: 'pending' | 'paid';
  staffId?: mongoose.Types.ObjectId;
  notes?: string;
  notifiedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LaundryItemModifiersSchema = new Schema<ILaundryItemModifiers>(
  {
    starchLevel: { type: String, enum: ['none', 'light', 'heavy'] },
    finish: { type: String, enum: ['folded', 'hangered'] },
    stainTreatment: { type: Boolean, default: false },
    notes: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const LaundryOrderItemSchema = new Schema<ILaundryOrderItem>(
  {
    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 0 },
    weight: { type: Number, min: 0 },
    subtotal: { type: Number, required: true },
    modifiers: { type: LaundryItemModifiersSchema, default: () => ({}) },
    tagId: { type: String },
  },
  { _id: false }
);

const LaundryOrderSchema = new Schema<ILaundryOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    customerName: { type: String, required: true, maxlength: 100 },
    customerPhone: { type: String, maxlength: 30 },
    items: { type: [LaundryOrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['inbasket', 'processing', 'ready', 'picked_up'],
      default: 'inbasket',
      index: true,
    },
    rackLocation: { type: String, maxlength: 50 },
    readyBy: { type: Date, required: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'tap_to_pay', 'digital_wallet', 'qr_code'],
    },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    staffId: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, maxlength: 500 },
    notifiedAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

LaundryOrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
LaundryOrderSchema.index({ tenantId: 1, orderNumber: 1 });

const LaundryOrder: Model<ILaundryOrder> =
  mongoose.models.LaundryOrder ||
  mongoose.model<ILaundryOrder>('LaundryOrder', LaundryOrderSchema);

export default LaundryOrder;
