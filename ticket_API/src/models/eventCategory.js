import mongoose from "mongoose";

const eventCategorySchema = new mongoose.Schema({
   event_id : {
       type: mongoose.Schema.Types.ObjectId,
       ref: "Event",
       required: true
   },
   category_id : {
       type: mongoose.Schema.Types.ObjectId,
       ref: "Category",
       required: true
   }
}, { timestamps: true });

const EventCategory = mongoose.model("EventCategory", eventCategorySchema);

export default EventCategory;
