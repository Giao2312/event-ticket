
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
    enum: ['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'],
    default: 'PENDING'
  },
  paymentMethod: { type: String, enum: ['COD', 'VNPay', 'MoMo'], default: 'VNPay' },
  paymentId: String,
  holdUntil: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, 
  tickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }], 
  createdAt: { type: Date, default: Date.now },
  paidAt: Date
});


orderSchema.index({ holdUntil: 1 }, { expireAfterSeconds: 0 });

orderSchema.virtual('totalItems').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

export default mongoose.model('Order', orderSchema);
