import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendance extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  clockIn: Date;
  clockOut?: Date;
  breakStart?: Date;
  breakEnd?: Date;
  totalHours?: number; // Calculated hours worked
  notes?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    clockIn: {
      type: Date,
      required: [true, 'Clock-in time is required'],
      index: true,
    },
    clockOut: {
      type: Date,
      index: true,
    },
    breakStart: {
      type: Date,
    },
    breakEnd: {
      type: Date,
    },
    totalHours: {
      type: Number,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    location: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
      address: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Calculate total hours when clocking out
AttendanceSchema.pre('save', function (next) {
  if (this.clockOut && this.clockIn) {
    const clockOut = this.clockOut as Date;
    const clockIn = this.clockIn as Date;
    let totalMs = clockOut.getTime() - clockIn.getTime();
    
    // Subtract break time if exists
    if (this.breakStart && this.breakEnd) {
      const breakStart = this.breakStart as Date;
      const breakEnd = this.breakEnd as Date;
      const breakMs = breakEnd.getTime() - breakStart.getTime();
      totalMs -= breakMs;
    }
    
    // Convert to hours (rounded to 2 decimal places)
    this.totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
  }
  next();
});

// Compound indexes for efficient queries
AttendanceSchema.index({ tenantId: 1, userId: 1, clockIn: -1 });
AttendanceSchema.index({ tenantId: 1, clockIn: -1 });
AttendanceSchema.index({ userId: 1, clockIn: -1 });
// Index for finding active sessions (clocked in but not out)
AttendanceSchema.index({ userId: 1, clockOut: 1 }, { partialFilterExpression: { clockOut: null } });

const Attendance: Model<IAttendance> = mongoose.models.Attendance || mongoose.model<IAttendance>('Attendance', AttendanceSchema);

export default Attendance;

