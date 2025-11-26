import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema({

  orderId: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "Order", required: true 
    },
  ticketTypeId: {
     type: mongoose.Schema.Types.ObjectId,
     ref: "TicketType", required: true 
    },
    UserId: {
     type: mongoose.Schema.Types.ObjectId,
      ref: "User", required: true 
  },
  qrCode: {
     type: String,
      required: true 
    }, // dữ liệu QR (base64)
  isUsed: { 
    type: Boolean,
     default: false },
  usedAt: { 
    type: Date, 
    default: null 
  },


}, { timestamps: true });

export default mongoose.model("Ticket", TicketSchema);
