// models/Event.js
import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'VIP', 'Normal', 'Student'
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  sold: { type: Number, default: 0 }
});

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên sự kiện là bắt buộc'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Ngày sự kiện là bắt buộc']
  },
  location: {
    type: String,
    required: [true, 'Địa điểm là bắt buộc']
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ticketTypes: [ticketTypeSchema],
  totalTickets: {
    type: Number,
    default: function () {
      return this.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
    }
  },
  createdAt: { type: Date, default: Date.now }
});

const Event = mongoose.model('Event', eventSchema);

export default Event;