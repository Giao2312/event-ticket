import mongoose from "mongoose";

const TicketTypeSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },

  quantity: { type: Number, required: true },
  sold: { type: Number, default: 0 },

  status: { type: String, default: "active" }
}, { timestamps: true });

export default mongoose.model("TicketType", TicketTypeSchema);

