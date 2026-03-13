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
  category: { 
    type: String, 
    required: true,
    enum: ['âm nhạc', 'ẩm thực', 'công nghệ', 'giải trí', 'kinh doanh', 'nghệ thuật', 'thể thao', 'workshop', 'khác'],
    default: 'khác'
  },
  description: { type: String, trim: true },
  date: { type: Date, required: [true, 'Ngày sự kiện là bắt buộc'] },
  location: { type: String, required: [true, 'Địa điểm là bắt buộc'] },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['upcoming', 'ongoing', 'past'], default: 'upcoming' },
  image: { type: String, default: '' }, 
  createdAt: { type: Date, default: Date.now }
});


eventSchema.index({ date: 1 });
eventSchema.index({ location: 1 });
eventSchema.index({ organizer: 1 });


eventSchema.virtual('totalTickets').get(function () {
  return this.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
});
eventSchema.virtual('availableTickets').get(function () {
  return this.ticketTypes.reduce((sum, t) => sum + (t.quantity - t.sold), 0);
});


eventSchema.pre('save', function (next) {
  const now = new Date();
  if (this.date < now) this.status = 'past';
  else if (this.date < now + 24 * 60 * 60 * 1000) this.status = 'ongoing';
  next();
});

const Event = mongoose.model('Event', eventSchema);

export default Event;
