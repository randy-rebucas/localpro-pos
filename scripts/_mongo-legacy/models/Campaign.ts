import mongoose, { Schema, Document, Model } from 'mongoose';

export type CampaignChannel = 'email' | 'sms';
export type CampaignSegment = 'all' | 'new' | 'regular' | 'vip' | 'at_risk' | 'lapsed';
export type CampaignStatus = 'draft' | 'sent' | 'failed';

export interface ICampaign extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  channel: CampaignChannel;
  segment: CampaignSegment;
  subject?: string; // email only
  body: string;
  status: CampaignStatus;
  sentCount?: number;
  sentAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
    },
    channel: {
      type: String,
      enum: ['email', 'sms'],
      required: [true, 'Channel is required'],
    },
    segment: {
      type: String,
      enum: ['all', 'new', 'regular', 'vip', 'at_risk', 'lapsed'],
      required: [true, 'Segment is required'],
    },
    subject: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Body is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'failed'],
      default: 'draft',
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    sentAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

CampaignSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const Campaign: Model<ICampaign> =
  mongoose.models.Campaign || mongoose.model<ICampaign>('Campaign', CampaignSchema);

export default Campaign;
