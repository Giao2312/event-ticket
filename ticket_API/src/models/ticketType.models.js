import mongoose from "mongoose";

const ticketTypeSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },

  title: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ""
  },

  price: {
    type: Number,
    required: true,
    min: 0
  },

  quantity: {
    type: Number,
    required: true
  },

  sold: {
    type: Number,
    default: 0
  },

  maxPerUser: {
    type: Number,
    default: 5
  },

  saleStart: Date,
  saleEnd: Date,

  status: {
    type: String,
    enum: ["active", "inactive", "sold_out"],
    default: "active"
  }

}, { timestamps: true });

export default mongoose.model("TicketType", ticketTypeSchema);
