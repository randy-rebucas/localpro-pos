import mongoose from 'mongoose';

// MongoDB-backed POS session (cart mirror for the customer display) for serverless compatibility
const posSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true }, // unique implies index
  tenant: { type: String, required: true },
  cart: { type: Array, default: [] },
  subtotal: { type: Number, default: 0 },
  discount: { type: mongoose.Schema.Types.Mixed, default: null },
  taxAmount: { type: Number },
  taxRate: { type: Number },
  taxLabel: { type: String },
  // VAT-inclusive prices: the tax is already inside the total, not added on top
  taxIncluded: { type: Boolean },
  tip: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paymentMethod: { type: String, default: null },
  paymentStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  // Epoch ms, sent to the display client. TTL can't use it (TTL needs a Date field).
  lastUpdate: { type: Number, default: Date.now },
}, {
  timestamps: true,
});

// TTL: auto-delete sessions idle for more than 1 hour
posSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3600 });

const PosSession = mongoose.models.PosSession || mongoose.model('PosSession', posSessionSchema);

export default PosSession;
