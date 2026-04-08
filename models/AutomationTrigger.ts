import mongoose, { Schema, Document, Model } from 'mongoose';

export type TriggerEvent =
  | 'birthday'
  | 'inactivity_30d'
  | 'inactivity_60d'
  | 'inactivity_90d'
  | 'post_purchase'
  | 'loyalty_milestone'
  | 'low_engagement';

export interface ITriggerConditions {
  daysBeforeBirthday?: number; // For birthday triggers
  loyaltyPointsThreshold?: number; // For loyalty_milestone
  inactivityDays?: number; // Override for inactivity
}

export interface ITriggerAction {
  channel: 'email' | 'sms';
  templateId?: string;
  subject?: string;
  message: string;
}

export interface IAutomationTrigger extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  event: TriggerEvent;
  conditions: ITriggerConditions;
  action: ITriggerAction;
  isActive: boolean;
  lastRunAt?: Date;
  totalFired: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AutomationTriggerSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    event: {
      type: String,
      enum: ['birthday', 'inactivity_30d', 'inactivity_60d', 'inactivity_90d', 'post_purchase', 'loyalty_milestone', 'low_engagement'],
      required: true,
    },
    conditions: {
      daysBeforeBirthday: { type: Number, default: 3 },
      loyaltyPointsThreshold: { type: Number },
      inactivityDays: { type: Number },
    },
    action: {
      channel: { type: String, enum: ['email', 'sms'], required: true },
      templateId: { type: String },
      subject: { type: String },
      message: { type: String, required: true, maxlength: 1000 },
    },
    isActive: { type: Boolean, default: true },
    lastRunAt: { type: Date },
    totalFired: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

AutomationTriggerSchema.index({ tenantId: 1, isActive: 1, event: 1 });

const AutomationTrigger: Model<IAutomationTrigger> =
  mongoose.models.AutomationTrigger ||
  mongoose.model<IAutomationTrigger>('AutomationTrigger', AutomationTriggerSchema);

export default AutomationTrigger;
