// models/Order.js
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

  items: [
    {
      ticketTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TicketType",
        required: true
      },
      quantity: Number,
      price: Number
    }
  ],

  totalAmount: {
    type: Number,
    required: true
  },

  paymentMethod: {
    type: String,
    enum: ["COD", "VNPay", "MoMo"],
    default: "COD"
  },

  status: {
    type: String,
    enum: ["PENDING", "PAID", "CANCELLED"],
    default: "PENDING"
  },

  paidAt: Date
}, { timestamps: true });

export default mongoose.model("Order", orderSchema);
