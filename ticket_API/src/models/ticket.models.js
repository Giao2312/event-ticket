import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema({

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },

  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  ticketType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TicketType"
  },

  qrCode: {
    type: String,
    required: true
  },

  isUsed: {
    type: Boolean,
    default: false
  },

  usedAt: Date,

  checkedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

export default mongoose.model("Ticket", TicketSchema);
