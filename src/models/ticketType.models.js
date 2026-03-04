import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  type: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  holded: { type: Number, default: 0 }, // vé đang hold
  sold: { type: Number, default: 0 },
  maxPerUser: { type: Number, default: 5 },
  saleStart: Date,
  saleEnd: Date,
  status: { type: String, enum: ['active', 'inactive', 'sold_out'], default: 'active' }
}, { timestamps: true });

ticketTypeSchema.index({ eventId: 1 });

// Virtual để tính vé còn lại
ticketTypeSchema.virtual('available').get(function () {
  return this.quantity - this.sold;
});


ticketTypeSchema.pre('validate', function (next) {
  if (this.saleStart && this.saleEnd && this.saleStart > this.saleEnd) {
    next(new Error('Sale start must be before end'));
  }
  next();
});


ticketTypeSchema.pre('save', function (next) {
  if (this.sold >= this.quantity) this.status = 'sold_out';
  next();
});

export default mongoose.model('TicketType', ticketTypeSchema);
