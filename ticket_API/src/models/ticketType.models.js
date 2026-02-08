import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 0 },
  sold: { type: Number, default: 0 },
  maxPerUser: { type: Number, default: 5 },
  saleStart: Date,
  saleEnd: Date,
  status: { type: String, enum: ['active', 'inactive', 'sold_out'], default: 'active' }
}, { timestamps: true });

// Index
ticketTypeSchema.index({ event: 1 });

// Virtual available
ticketTypeSchema.virtual('available').get(function () {
  return this.quantity - this.sold;
});

// Validation sale dates
ticketTypeSchema.pre('validate', function (next) {
  if (this.saleStart && this.saleEnd && this.saleStart > this.saleEnd) {
    next(new Error('Sale start must be before end'));
  }
  next();
});

// Hook auto status
ticketTypeSchema.pre('save', function (next) {
  if (this.sold >= this.quantity) this.status = 'sold_out';
  next();
});

export default mongoose.model('TicketType', ticketTypeSchema);