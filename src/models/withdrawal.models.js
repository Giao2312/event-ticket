import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema({
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  // Số tiền organizer yêu cầu rút
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  // Phí hoa hồng Admin (%)
  commissionRate: {
    type: Number,
    default: 10
  },
  // Số tiền hoa hồng
  commissionAmount: {
    type: Number,
    default: 0
  },
  // Số tiền thực nhận (sau khi trừ hoa hồng)
  netAmount: {
    type: Number,
    default: 0
  },
  // Số dư khả dụng của organizer tại thời điểm yêu cầu
  availableBalance: {
    type: Number,
    default: 0
  },
  // Phương thức thanh toán: bank_transfer, momo, vnpay
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'momo', 'vnpay'],
    default: 'bank_transfer'
  },
  // Thông tin tài khoản nhận tiền
  bankAccount: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' }
  },
  // Trạng thái: PENDING, APPROVED, REJECTED, COMPLETED, FAILED
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  // Admin ghi chú khi duyệt/từ chối
  adminNote: {
    type: String,
    default: null
  },
  // Người duyệt
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  // Hoàn tiền thất bại
  failureReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index để query nhanh
withdrawalSchema.index({ organizerId: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

// Tính commission và netAmount trước khi save
withdrawalSchema.pre('save', function (next) {
  if (this.isModified('amount') || this.isModified('commissionRate')) {
    this.commissionAmount = Math.round(this.amount * this.commissionRate / 100);
    this.netAmount = this.amount - this.commissionAmount;
  }
  next();
});

export default mongoose.model('Withdrawal', withdrawalSchema);
