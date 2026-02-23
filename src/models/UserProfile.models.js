import mongoose from "mongoose";

const userProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true
  },

  phone: {
    type: String,
    default: ""
  },

  dob: {
    type: Date,
    default: null
  },

  address: {
    type: String,
    default: ""
  },

  avatar: {
    type: String,
    default: ""
  }

}, { timestamps: true });

export default mongoose.model("UserProfile", userProfileSchema);
