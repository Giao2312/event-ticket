import mongoose from 'mongoose';
import User from '../models/user.models.js';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Settlement from '../models/settlement.models.js';
import Withdrawal from '../models/withdrawal.models.js';
import logger from '../utils/logger.js';

const DEFAULT_COMMISSION_RATE = 10;

const createSettlementError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// ============================================================
// Tính doanh thu của organizer theo kỳ hoặc theo sự kiện
// ============================================================
export const calculateOrganizerEarnings = async ({ organizerId, eventId = null, periodStart = null, periodEnd = null }) => {
  // Lấy danh sách sự kiện của organizer
  const eventQuery = { organizer: organizerId };
  if (eventId) {
    eventQuery._id = eventId;
  }

  const events = await Event.find(eventQuery).select('_id name').lean();
  const eventIds = events.map(e => e._id);

  if (eventIds.length === 0) {
    return { totalRevenue: 0, totalOrders: 0, paidOrders: 0, commissionAmount: 0, netAmount: 0 };
  }

  // Build match query cho orders
  const orderMatch = {
    eventId: { $in: eventIds },
    status: 'PAID'
  };

  if (periodStart && periodEnd) {
    orderMatch.createdAt = { $gte: periodStart, $lte: periodEnd };
  }

  // Tính tổng doanh thu
  const revenueAgg = await Order.aggregate([
    { $match: orderMatch },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalAmount' },
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  const totalRevenue = revenueAgg[0]?.totalRevenue || 0;
  const totalOrders = revenueAgg[0]?.totalOrders || 0;

  // Tính hoa hồng
  const commissionAmount = Math.round(totalRevenue * DEFAULT_COMMISSION_RATE / 100);
  const netAmount = totalRevenue - commissionAmount;

  return {
    totalRevenue,
    totalOrders,
    paidOrders: totalOrders,
    commissionAmount,
    netAmount,
    events: events.map(e => ({ eventId: e._id, name: e.name }))
  };
};

// ============================================================
// Tạo settlement request cho organizer
// ============================================================
export const createSettlement = async ({ organizerId, eventId = null, periodStart, periodEnd, createdBy, adminNote = '' }) => {
  // Kiểm tra organizer tồn tại
  const organizer = await User.findById(organizerId);
  if (!organizer) {
    throw createSettlementError('Organizer không tồn tại', 404);
  }

  if (organizer.role !== 'Organizer') {
    throw createSettlementError('Người dùng không phải là organizer');
  }

  // Tính doanh thu
  const earnings = await calculateOrganizerEarnings({
    organizerId,
    eventId,
    periodStart: periodStart ? new Date(periodStart) : null,
    periodEnd: periodEnd ? new Date(periodEnd) : null
  });

  if (earnings.totalRevenue <= 0) {
    throw createSettlementError('Không có doanh thu để settlement');
  }

  // Lấy số dư organizer
  const organizerBalanceBefore = organizer.balance || 0;

  // Tạo settlement
  const settlement = new Settlement({
    organizerId,
    eventId,
    periodStart: periodStart ? new Date(periodStart) : new Date(0),
    periodEnd: periodEnd ? new Date(periodEnd) : new Date(),
    totalRevenue: earnings.totalRevenue,
    totalOrders: earnings.totalOrders,
    paidOrders: earnings.paidOrders,
    commissionRate: DEFAULT_COMMISSION_RATE,
    commissionAmount: earnings.commissionAmount,
    netAmount: earnings.netAmount,
    organizerBalanceBefore,
    createdBy,
    adminNote,
    paymentDetails: organizer.bankInfo || {}
  });

  await settlement.save();

  logger.info(`Settlement created for organizer ${organizerId}: revenue=${earnings.totalRevenue}, net=${earnings.netAmount}`);

  return settlement;
};

// ============================================================
// Lấy danh sách settlements
// ============================================================
export const getSettlements = async ({ page = 1, limit = 15, status = '', organizerId = '' }) => {
  const query = {};

  if (status) {
    query.status = status;
  }

  if (organizerId) {
    query.organizerId = organizerId;
  }

  const total = await Settlement.countDocuments(query);

  const settlements = await Settlement.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('organizerId', 'name email')
    .populate('eventId', 'name')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name')
    .lean();

  return {
    settlements,
    pagination: {
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
};

// ============================================================
// Lấy chi tiết settlement
// ============================================================
export const getSettlementById = async (settlementId) => {
  const settlement = await Settlement.findById(settlementId)
    .populate('organizerId', 'name email bankInfo')
    .populate('eventId', 'name')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name');

  if (!settlement) {
    throw createSettlementError('Settlement không tồn tại', 404);
  }

  return settlement;
};

// ============================================================
// Duyệt settlement (Admin xác nhận đối soát)
// ============================================================
export const approveSettlement = async ({ settlementId, adminId, adminNote }) => {
  const settlement = await Settlement.findById(settlementId);

  if (!settlement) {
    throw createSettlementError('Settlement không tồn tại', 404);
  }

  if (settlement.status !== 'PENDING') {
    throw createSettlementError('Settlement không ở trạng thái chờ duyệt');
  }

  settlement.status = 'APPROVED';
  settlement.approvedBy = adminId;
  settlement.approvedAt = new Date();
  if (adminNote) {
    settlement.adminNote = adminNote;
  }

  await settlement.save();

  logger.info(`Settlement ${settlementId} approved by admin ${adminId}`);

  return settlement;
};

// ============================================================
// Hoàn thành settlement (Admin đã chuyển tiền)
// ============================================================
export const completeSettlement = async ({ settlementId, adminId }) => {
  const session = await mongoose.startSession();

  try {
    let settlement = null;

    await session.withTransaction(async () => {
      settlement = await Settlement.findById(settlementId).session(session);

      if (!settlement) {
        throw createSettlementError('Settlement không tồn tại', 404);
      }

      if (settlement.status !== 'APPROVED') {
        throw createSettlementError('Settlement phải được duyệt trước khi hoàn thành');
      }

      // Cập nhật trạng thái
      settlement.status = 'COMPLETED';
      settlement.paidAt = new Date();

      await settlement.save({ session });

      // Cập nhật số dư organizer
      await User.findByIdAndUpdate(settlement.organizerId, {
        $inc: { balance: settlement.netAmount }
      }, { session });

      logger.info(`Settlement ${settlementId} completed. Organizer ${settlement.organizerId} received ${settlement.netAmount}`);
    });

    return settlement;
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

// ============================================================
// Hủy settlement
// ============================================================
export const cancelSettlement = async ({ settlementId, adminId, reason }) => {
  const settlement = await Settlement.findById(settlementId);

  if (!settlement) {
    throw createSettlementError('Settlement không tồn tại', 404);
  }

  if (settlement.status === 'COMPLETED') {
    throw createSettlementError('Không thể hủy settlement đã hoàn thành');
  }

  settlement.status = 'CANCELLED';
  settlement.adminNote = reason || 'Đã hủy bởi admin';

  await settlement.save();

  logger.info(`Settlement ${settlementId} cancelled by admin ${adminId}`);

  return settlement;
};

// ============================================================
// Dashboard: Thống kê settlement cho Admin
// ============================================================
export const getSettlementStats = async () => {
  const [
    totalSettlements,
    pendingCount,
    approvedCount,
    completedCount,
    totalCommission,
    totalNetPaid
  ] = await Promise.all([
    Settlement.countDocuments({}),
    Settlement.countDocuments({ status: 'PENDING' }),
    Settlement.countDocuments({ status: 'APPROVED' }),
    Settlement.countDocuments({ status: 'COMPLETED' }),
    Settlement.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]),
    Settlement.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } }
    ])
  ]);

  return {
    totalSettlements,
    pendingCount,
    approvedCount,
    completedCount,
    totalCommission: totalCommission[0]?.total || 0,
    totalNetPaid: totalNetPaid[0]?.total || 0
  };
};

// ============================================================
// Dashboard: Danh sách organizers với doanh thu
// ============================================================
export const getOrganizersWithEarnings = async () => {
  // Lấy tất cả organizers
  const organizers = await User.find({ role: 'Organizer' })
    .select('_id name email balance')
    .lean();

  const organizersWithEarnings = await Promise.all(
    organizers.map(async (org) => {
      // Tính doanh thu tổng
      const earnings = await calculateOrganizerEarnings({ organizerId: org._id });

      // Lấy số withdrawal đang chờ
      const pendingWithdrawals = await Withdrawal.countDocuments({
        organizerId: org._id,
        status: 'PENDING'
      });

      return {
        ...org,
        totalRevenue: earnings.totalRevenue,
        commissionOwed: earnings.commissionAmount,
        netEarning: earnings.netAmount,
        pendingWithdrawals
      };
    })
  );

  // Sort theo doanh thu giảm dần
  organizersWithEarnings.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return organizersWithEarnings;
};
