
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  items: [{
    ticketTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketType', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED'],
    default: 'PENDING'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'momo', 'vnpay', 'paypal'], 
    required: true,
    set: (v) => v ? v.toLowerCase() : v
  },
  momoOrderId: { type: String, index: true, sparse: true },
  paypalOrderId: { type: String },
  paymentError: { type: String, default: null },
  holdUntil: { type: Date, default: () => new Date(Date.now() + 15 * 60 * 1000) },
  tickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }],
  profileVerifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  paidAt: Date
});



orderSchema.index({ holdUntil: 1 }, { 
  expireAfterSeconds: 0, 
  partialFilterExpression: { status: { $ne: 'PAID' } } 
});

orderSchema.virtual('totalItems').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

export default mongoose.model('Order', orderSchema);
