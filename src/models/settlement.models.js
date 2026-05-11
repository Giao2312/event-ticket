import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema({
  // Organizer nhận settlement
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Sự kiện liên quan (có thể null nếu settlement tổng hợp)
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  // Khoảng thời gian settlement
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  // Tổng doanh thu trong kỳ
  totalRevenue: {
    type: Number,
    default: 0
  },
  // Tổng số đơn hàng
  totalOrders: {
    type: Number,
    default: 0
  },
  // Số đơn đã thanh toán
  paidOrders: {
    type: Number,
    default: 0
  },
  // Tổng hoa hồng Admin (%)
  commissionRate: {
    type: Number,
    default: 10
  },
  // Tổng tiền hoa hồng
  commissionAmount: {
    type: Number,
    default: 0
  },
  // Số tiền cần chuyển cho Organizer
  netAmount: {
    type: Number,
    default: 0
  },
  // Số dư khả dụng của organizer tại thời điểm settlement
  organizerBalanceBefore: {
    type: Number,
    default: 0
  },
  // Trạng thái: PENDING, APPROVED, COMPLETED, CANCELLED
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  // Admin ghi chú
  adminNote: {
    type: String,
    default: null
  },
  // Người tạo / duyệt
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  // Ngày chuyển tiền thực tế
  paidAt: {
    type: Date,
    default: null
  },
  // Thông tin thanh toán
  paymentDetails: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' }
  }
}, {
  timestamps: true
});

// Index
settlementSchema.index({ organizerId: 1, status: 1 });
settlementSchema.index({ eventId: 1 });
settlementSchema.index({ createdAt: -1 });

export default mongoose.model('Settlement', settlementSchema);
