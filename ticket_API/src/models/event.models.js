import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  slug: {
    type: String,
    required: true,
    unique: true
  },

  description: {
    type: String,
    default: ""
  },

  category: {
    type: String,
    required: true,
    index: true
  },

  image: {
    type: String,
    default: ""
  },

  location: {
    type: String,
    required: true
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  price: {
    type: Number,
    required: true,
    min: 0
  },

  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Venue"
  },

  status: {
    type: String,
    enum: ["scheduled", "ongoing", "completed", "cancelled"],
    default: "scheduled"
  },

  isFeatured: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

export default mongoose.model("Event", eventSchema);
