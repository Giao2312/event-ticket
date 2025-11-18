import mongoose from "mongoose";

const venueSchema = new mongoose.Schema({
    title : {
        type: String,
        required: true
    },

    location : {
        type: String,
        required: true
    },  
    capacity : {
        type: Number,
        required: true
    },
    facilities : {
        type: [String],
        required: false
    },
}, { timestamps: true });

const Venue = mongoose.model("Venue", venueSchema);

export default Venue;
