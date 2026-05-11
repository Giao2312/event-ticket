import mongoose from 'mongoose';
import User from '../models/user.models.js';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Withdrawal from '../models/withdrawal.models.js';
import logger from '../utils/logger.js';

const DEFAULT_COMMISSION_RATE = 10; // 10% hoa hồng Admin

const createWithdrawalError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// ============================================================
// Tính số dư khả dụng của organizer từ các đơn hàng đã thanh toán
// Số dư = Tổng tiền vé bán được - Tổng hoa hồng - Đã rút
// ============================================================
export const calculateOrganizerBalance = async (organizerId) => {
  // Lấy tất cả sự kiện của organizer
  const events = await Event.find({ organizer: organizerId }).select('_id').lean();
  const eventIds = events.map(e => e._id);

  if (eventIds.length === 0) {
    return {
      totalRevenue: 0,
      commissionOwed: 0,
      totalWithdrawn: 0,
      totalNetReceived: 0,
      available: 0
    };
  }

  // Tổng tiền từ đơn hàng PAID của các sự kiện này
  const revenueAgg = await Order.aggregate([
    { $match: { eventId: { $in: eventIds }, status: 'PAID' } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalRevenue = revenueAgg[0]?.total || 0;

  // Tổng tiền đã rút
  const withdrawnAgg = await Withdrawal.aggregate([
    { $match: { organizerId: new mongoose.Types.ObjectId(organizerId), status: { $in: ['APPROVED', 'COMPLETED'] } } },
    {
      $group: {
        _id: null,
        totalRequested: { $sum: '$amount' },
        totalNetReceived: { $sum: '$netAmount' }
      }
    }
  ]);
  const totalWithdrawn = withdrawnAgg[0]?.totalRequested || 0;
  const totalNetReceived = withdrawnAgg[0]?.totalNetReceived || 0;

  // Tính hoa hồng
  const commissionOwed = Math.round(totalRevenue * DEFAULT_COMMISSION_RATE / 100);
  const available = totalRevenue - commissionOwed - totalWithdrawn;

  return {
    totalRevenue,
    commissionOwed,
    totalWithdrawn,
    totalNetReceived,
    available: Math.max(0, available)
  };
};

// ============================================================
// Organizer yêu cầu rút tiền
// ============================================================
export const requestWithdrawal = async ({ organizerId, amount, paymentMethod = 'bank_transfer', bankAccount }) => {
  // Kiểm tra số dư khả dụng
  const balance = await calculateOrganizerBalance(organizerId);

  if (amount <= 0) {
    throw createWithdrawalError('Số tiền rút phải lớn hơn 0');
  }

  if (amount > balance.available) {
    throw createWithdrawalError(`Số dư khả dụng không đủ. Số dư hiện tại: ${balance.available.toLocaleString('vi-VN')} VNĐ`);
  }

  // Tạo yêu cầu rút tiền
  const withdrawal = new Withdrawal({
    organizerId,
    amount,
    commissionRate: 0,
    commissionAmount: 0,
    netAmount: amount,
    availableBalance: balance.available,
    paymentMethod,
    bankAccount: bankAccount || {}
  });

  await withdrawal.save();

  logger.info(`Organizer ${organizerId} requested withdrawal of ${amount}`);

  return withdrawal;
};

// ============================================================
// Admin lấy danh sách yêu cầu rút tiền
// ============================================================
export const getWithdrawals = async ({ page = 1, limit = 10, status = '', organizerId = '' }) => {
  const query = {};

  if (status) {
    query.status = status;
  }

  if (organizerId) {
    query.organizerId = organizerId;
  }

  const total = await Withdrawal.countDocuments(query);

  const withdrawals = await Withdrawal.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('organizerId', 'name email')
    .populate('approvedBy', 'name')
    .lean();

  return {
    withdrawals,
    pagination: {
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
};

// ============================================================
// Admin duyệt yêu cầu rút tiền
// ============================================================
export const approveWithdrawal = async ({ withdrawalId, adminId, adminNote }) => {
  const session = await mongoose.startSession();

  try {
    let withdrawal = null;

    await session.withTransaction(async () => {
      withdrawal = await Withdrawal.findById(withdrawalId).session(session);

      if (!withdrawal) {
        throw createWithdrawalError('Không tìm thấy yêu cầu rút tiền', 404);
      }

      if (withdrawal.status !== 'PENDING') {
        throw createWithdrawalError('Yêu cầu này không ở trạng thái chờ duyệt');
      }

      // Cập nhật trạng thái
      withdrawal.status = 'APPROVED';
      withdrawal.approvedBy = adminId;
      withdrawal.approvedAt = new Date();
      if (adminNote) {
        withdrawal.adminNote = adminNote;
      }

      await withdrawal.save({ session });

      // TODO: Thực hiện chuyển khoản thực tế ở đây
      // Hiện tại đánh dấu là COMPLETED luôn (simulate)
      withdrawal.status = 'COMPLETED';

      await withdrawal.save({ session });

      // Cập nhật số dư đã rút của organizer
      await User.findByIdAndUpdate(withdrawal.organizerId, {
        $inc: { balance: -withdrawal.netAmount }
      }, { session });

      logger.info(`Admin ${adminId} approved withdrawal ${withdrawalId} for ${withdrawal.netAmount}`);
    });

    return withdrawal;
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

// ============================================================
// Admin từ chối yêu cầu rút tiền
// ============================================================
export const rejectWithdrawal = async ({ withdrawalId, adminId, reason }) => {
  const withdrawal = await Withdrawal.findById(withdrawalId);

  if (!withdrawal) {
    throw createWithdrawalError('Không tìm thấy yêu cầu rút tiền', 404);
  }

  if (withdrawal.status !== 'PENDING') {
    throw createWithdrawalError('Yêu cầu này không ở trạng thái chờ duyệt');
  }

  withdrawal.status = 'REJECTED';
  withdrawal.approvedBy = adminId;
  withdrawal.approvedAt = new Date();
  withdrawal.adminNote = reason || 'Yêu cầu bị từ chối';

  await withdrawal.save();

  logger.info(`Admin ${adminId} rejected withdrawal ${withdrawalId}: ${reason}`);

  return withdrawal;
};

// ============================================================
// Lấy thông tin số dư của organizer
// ============================================================
export const getOrganizerBalance = async (organizerId) => {
  const balance = await calculateOrganizerBalance(organizerId);

  // Lấy danh sách yêu cầu rút tiền gần đây
  const recentWithdrawals = await Withdrawal.find({ organizerId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // Lấy danh sách sự kiện với doanh thu
  const events = await Event.find({ organizer: organizerId })
    .select('name date ticketTypes')
    .lean();

  const eventRevenues = events.map(event => {
    const totalTickets = (event.ticketTypes || []).reduce((sum, tt) => sum + Number(tt.sold || 0), 0);
    const revenue = (event.ticketTypes || []).reduce((sum, tt) => sum + (Number(tt.sold || 0) * Number(tt.price || 0)), 0);

    return {
      eventId: event._id,
      name: event.name,
      date: event.date,
      ticketsSold: totalTickets,
      revenue
    };
  });

  return {
    ...balance,
    recentWithdrawals,
    eventRevenues
  };
};
