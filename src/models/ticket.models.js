
import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  ticketType: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
  qrCode: { type: String }, // DataURL QR image (kept for backward compat)
  qrToken: { type: String }, // Legacy raw JWT token for backward compatibility
  qrTokenHash: { type: String }, // SHA-256 hash of the current QR token
  qrJti: { type: String }, // Revocation id of the current QR token
  usedAt: { type: Date, default: null }, // Timestamp when ticket was used for check-in
  purchasedAt: { type: Date, default: Date.now }
});

// Indexes
ticketSchema.index({ qrCode: 1 }, { unique: true, sparse: true });
ticketSchema.index({ qrToken: 1 }, { unique: true, sparse: true });
ticketSchema.index({ qrTokenHash: 1 }, { unique: true, sparse: true });
ticketSchema.index({ qrJti: 1 }, { unique: true, sparse: true });
ticketSchema.index({ event: 1, user: 1 });
ticketSchema.index({ status: 1 });

// Virtual: check if ticket is valid for entry
ticketSchema.virtual('isValid').get(function () {
  return this.status === 'paid' && !this.usedAt;
});

// Method: Verify and use ticket (for check-in)
ticketSchema.methods.verifyAndUse = function () {
  if (this.status !== 'paid') {
    return { valid: false, error: 'Ticket is not paid' };
  }
  if (this.usedAt) {
    return { valid: false, error: 'Ticket has already been used', usedAt: this.usedAt };
  }
  this.usedAt = new Date();
  return { valid: true };
};

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
