const venueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },

  location: {
    type: String,
    required: true
  },

  description: String,

  capacity: {
    type: Number,
    required: true
  },

  facilities: [String],

  image: String,

  mapUrl: String

}, { timestamps: true });

export default mongoose.model("Venue", venueSchema);
