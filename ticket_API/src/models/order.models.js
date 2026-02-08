// models/Order.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  items: [{
    ticketTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketType', required: true },
    quantity: Number,
    price: Number
  }],
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['COD', 'VNPay', 'MoMo'], default: 'COD' },
  status: { type: String, enum: ['PENDING', 'PAID', 'CANCELLED'], default: 'PENDING' },
  tickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }], // Ref vé sinh ra sau paid
  paidAt: Date
}, { timestamps: true });

// Index
orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ eventId: 1 });

// Virtual totalItems
orderSchema.virtual('totalItems').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

export default mongoose.model('Order', orderSchema);