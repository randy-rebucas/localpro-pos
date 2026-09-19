import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBooking extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  startTime: Date;
  endTime: Date;
  duration: number; // Duration in minutes
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  staffId?: mongoose.Types.ObjectId; // Assigned staff member
  staffName?: string; // Denormalized for easier queries
  notes?: string;
  reminderSent?: boolean;
  confirmationSent?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema: Schema = new Schema(
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
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true,
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'],
      default: 'pending',
    },
    staffId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    staffName: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    confirmationSent: {
      type: Boolean,
      default: false,
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

// Compound indexes for efficient queries
BookingSchema.index({ tenantId: 1, startTime: 1 });
BookingSchema.index({ tenantId: 1, staffId: 1, startTime: 1 });
BookingSchema.index({ startTime: 1, endTime: 1 }); // For conflict detection
// Covers both status filtering and date-sorted queries; replaces the simpler { tenantId, status } index
BookingSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Virtual to check if booking is in the past
BookingSchema.virtual('isPast').get(function(this: IBooking) {
  return this.endTime < new Date();
});

// Virtual to check if booking is today
BookingSchema.virtual('isToday').get(function(this: IBooking) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookingDate = new Date(this.startTime);
  bookingDate.setHours(0, 0, 0, 0);
  return bookingDate.getTime() === today.getTime();
});

// Pre-save middleware to calculate endTime, validate times, and check overlaps
BookingSchema.pre('save', async function(this: IBooking, next) {
  // Auto-calculate endTime from startTime + duration
  if (this.isModified('startTime') || this.isModified('duration')) {
    if (this.startTime && this.duration) {
      this.endTime = new Date(this.startTime.getTime() + this.duration * 60000);
    }
  }

  // Validate endTime > startTime
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    return next(new Error('End time must be after start time'));
  }

  // Check for staff double-booking (overlapping active bookings)
  if (this.staffId && this.startTime && this.endTime &&
      (this.isModified('startTime') || this.isModified('endTime') || this.isModified('staffId'))) {
    const activeStatuses = ['pending', 'confirmed'];
    if (activeStatuses.includes(this.status)) {
      const overlap = await mongoose.model('Booking').findOne({
        _id: { $ne: this._id },
        tenantId: this.tenantId,
        staffId: this.staffId,
        status: { $in: activeStatuses },
        startTime: { $lt: this.endTime },
        endTime: { $gt: this.startTime },
      });
      if (overlap) {
        return next(new Error('Staff member has an overlapping booking during this time'));
      }
    }
  }

  // Populate staffName if staffId is set
  if (this.isModified('staffId') && this.staffId) {
    try {
      const User = mongoose.model('User');
      const staff = await User.findById(this.staffId).select('name').lean() as { name: string } | null;
      if (staff && staff.name) {
        this.staffName = staff.name;
      }
    } catch {
      // Ignore error, staffName will remain undefined
    }
  }

  next();
});

const Booking: Model<IBooking> = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);

export default Booking;

