import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },

  ticketTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TicketType",
    required: true
  },

  quantity: {
    type: Number,
    required: true,
    min: 1
  },

  totalAmount: {
    type: Number,
    required: true
  },

  paymentMethod: {
    type: String,
    enum: ["VNPay", "MoMo", "ZaloPay", "Cash"],
    required: true
  },

  status: {
    type: String,
    enum: ["PENDING", "PAID", "CANCELLED"],
    default: "PENDING"
  },

  paidAt: {
    type: Date,
    default: null
  }

}, { timestamps: true });

export default mongoose.model("Order", orderSchema);
