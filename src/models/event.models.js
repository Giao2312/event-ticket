import mongoose from 'mongoose';
import slugify from 'slugify';

const ticketTypeSubSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  sold: {
    type: Number,
    default: 0,
    min: 0
  },
  holded: {
    type: Number,
    default: 0,
    min: 0
  },
  maxPerUser: {
    type: Number,
    default: 5,
    min: 1
  },
  saleStart: {
    type: Date
  },
  saleEnd: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'sold_out'],
    default: 'active'
  }
});

// Virtual tính vé còn lại cho từng loại vé
ticketTypeSubSchema.virtual('available').get(function () {
  const holded = this.holded || 0;
  return this.quantity - this.sold - holded;
});

// Pre-validate cho từng loại vé
ticketTypeSubSchema.pre('validate', function (next) {
  if (this.saleStart && this.saleEnd && this.saleStart > this.saleEnd) {
    next(new Error('Sale start phải trước sale end'));
  }
  next();
});

// Pre-save cho từng loại vé
ticketTypeSubSchema.pre('save', function (next) {
  if (this.sold >= this.quantity) {
    this.status = 'sold_out';
  }
  next();
});

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên sự kiện là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tên sự kiện quá dài']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['âm nhạc', 'ẩm thực', 'công nghệ', 'giải trí', 'kinh doanh', 'nghệ thuật', 'thể thao', 'workshop', 'khác'],
    default: 'khác'
  },
  description: { type: String, trim: true, maxlength: 5000 },
  date: { type: Date, required: [true, 'Ngày sự kiện là bắt buộc'] },
  location: { type: String, required: [true, 'Địa điểm là bắt buộc'], trim: true },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  image: { type: String, default: '' },

  status: {
    type: String,
    enum: [
      'draft', 'pending', 'approved', 'rejected',
      'published', 'upcoming', 'ongoing', 'ended', 'cancelled'
    ],
    default: 'draft'
  },
  approvalNotes: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectionReason: { type: String },

  // Gộp TicketType vào đây (sub-document array)
  ticketTypes: [ticketTypeSubSchema],

  views: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
eventSchema.index({ date: 1 });
eventSchema.index({ location: 'text' });
eventSchema.index({ organizer: 1 });
eventSchema.index({ status: 1 });

// Virtuals tổng hợp
eventSchema.virtual('totalTickets').get(function () {
  return this.ticketTypes?.reduce((sum, t) => sum + (t.quantity || 0), 0) || 0;
});

eventSchema.virtual('totalSold').get(function () {
  return this.ticketTypes?.reduce((sum, t) => sum + (t.sold || 0), 0) || 0;
});

eventSchema.virtual('availableTickets').get(function () {
  return this.totalTickets - this.totalSold;
});

eventSchema.virtual('fillRate').get(function () {
  return this.totalTickets > 0 ? Math.round((this.totalSold / this.totalTickets) * 100) : 0;
});

// Pre-save hooks
eventSchema.pre('save', function (next) {
  // Slug
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-6);
  }

  // Cập nhật status theo ngày
  const now = new Date();
  if (this.date < now) {
    this.status = 'ended';
  } else if (this.status === 'published' || this.status === 'approved') {
    if (this.date <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
      this.status = 'ongoing';
    } else {
      this.status = 'upcoming';
    }
  }

  // Giới hạn sold không vượt quantity
  if (this.ticketTypes) {
    this.ticketTypes.forEach(tt => {
      if (tt.sold > tt.quantity) {
        tt.sold = tt.quantity;
      }
    });
  }

  next();
});

// Pre-validate: yêu cầu ít nhất 1 loại vé
eventSchema.pre('validate', function (next) {
  if (!this.ticketTypes || this.ticketTypes.length === 0) {
    this.invalidate('ticketTypes', 'Phải có ít nhất một loại vé');
  }
  next();
});

const Event = mongoose.model('Event', eventSchema);

export default Event;
