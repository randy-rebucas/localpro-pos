import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRecurringBookingTemplate extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  staffId?: mongoose.Types.ObjectId;
  staffName?: string;
  duration: number; // Minutes
  startTimeHour: number; // 0-23
  startTimeMinute: number; // 0-59
  recurrenceType: 'daily' | 'weekly' | 'monthly';
  daysOfWeek?: number[]; // 0=Sun…6=Sat, used when recurrenceType='weekly'
  dayOfMonth?: number; // 1-31, used when recurrenceType='monthly'
  effectiveFrom: Date;
  effectiveTo?: Date; // Null = no end date
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RecurringBookingTemplateSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    customerPhone: {
      type: String,
      trim: true,
    },
    serviceName: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    serviceDescription: {
      type: String,
      trim: true,
    },
    staffId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    staffName: {
      type: String,
      trim: true,
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: 1,
    },
    startTimeHour: {
      type: Number,
      required: [true, 'Start time hour is required'],
      min: 0,
      max: 23,
    },
    startTimeMinute: {
      type: Number,
      required: [true, 'Start time minute is required'],
      min: 0,
      max: 59,
    },
    recurrenceType: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: [true, 'Recurrence type is required'],
    },
    daysOfWeek: {
      type: [Number],
      validate: {
        validator: (days: number[]) => days.every(d => d >= 0 && d <= 6),
        message: 'daysOfWeek values must be 0–6',
      },
    },
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31,
    },
    effectiveFrom: {
      type: Date,
      required: [true, 'Effective from date is required'],
    },
    effectiveTo: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
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

RecurringBookingTemplateSchema.index({ tenantId: 1, isActive: 1 });
RecurringBookingTemplateSchema.index({ tenantId: 1, staffId: 1, isActive: 1 });
RecurringBookingTemplateSchema.index({ tenantId: 1, recurrenceType: 1, isActive: 1 });

const RecurringBookingTemplate: Model<IRecurringBookingTemplate> =
  mongoose.models.RecurringBookingTemplate ||
  mongoose.model<IRecurringBookingTemplate>(
    'RecurringBookingTemplate',
    RecurringBookingTemplateSchema
  );

export default RecurringBookingTemplate;
