// models/Event.js
import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  type: { type: String, required: true },
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
  description: { type: String, trim: true },
  date: { type: Date, required: [true, 'Ngày sự kiện là bắt buộc'] },
  location: { type: String, required: [true, 'Địa điểm là bắt buộc'] },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ticketTypes: [ticketTypeSchema],
  status: { type: String, enum: ['upcoming', 'ongoing', 'past'], default: 'upcoming' },
  image: { type: String, default: '' }, // Thêm cho banner
  createdAt: { type: Date, default: Date.now }
});

// Index cho query
eventSchema.index({ date: 1 });
eventSchema.index({ location: 1 });
eventSchema.index({ organizer: 1 });

// Virtual totalTickets và availableTickets
eventSchema.virtual('totalTickets').get(function () {
  return this.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
});
eventSchema.virtual('availableTickets').get(function () {
  return this.ticketTypes.reduce((sum, t) => sum + (t.quantity - t.sold), 0);
});

// Hook tự động update status trước save/query
eventSchema.pre('save', function (next) {
  const now = new Date();
  if (this.date < now) this.status = 'past';
  else if (this.date < now + 24 * 60 * 60 * 1000) this.status = 'ongoing'; // Ví dụ: trong 1 ngày
  next();
});

const Event = mongoose.model('Event', eventSchema);

export default Event;