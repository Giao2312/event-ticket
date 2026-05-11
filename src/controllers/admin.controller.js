import { body, validationResult } from 'express-validator';
import roleMiddleware from '../middlewares/role.middleware.js';
import Event from '../models/event.models.js';
import Order from '../models/order.models.js';
import Ticket from '../models/ticket.models.js';
import User from '../models/user.models.js';
import AuditLog from '../models/auditlog.models.js';
import EventReview from '../models/EventReview.models.js';
import UserFavoriteEvent from '../models/UserFavoriteEvent.models.js';
import Notification from '../models/notification.models.js';
import Withdrawal from '../models/withdrawal.models.js';
import Settlement from '../models/settlement.models.js';
import logger from '../utils/logger.js';
import {
  createUnifiedEvent,
  publishEvent,
  rejectEventByAdmin
} from '../services/event.service.js';
import { approveOrder } from '../services/checkout.service.js';
import {
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal
} from '../services/withdrawal.service.js';
import {
  getSettlements,
  getSettlementById,
  createSettlement,
  approveSettlement,
  completeSettlement,
  cancelSettlement,
  getSettlementStats,
  getOrganizersWithEarnings
} from '../services/settlement.service.js';

// Tao mang 14 ngay lien tiep de hien thi bieu do thong ke
const buildLast14Days = () => {
  const now = new Date();
  const startDay = new Date(now);
  startDay.setDate(now.getDate() - 13);
  startDay.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(startDay);
    d.setDate(startDay.getDate() + i);
    return d;
  });

  const labels = days.map((d) => d.toISOString().slice(0, 10));
  return { startDay, labels };
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactRoleQuery = (role) => ({
  $regex: new RegExp(`^${escapeRegex(role)}$`, 'i')
});

// Kiem tra va tao canh bao ban ve cham dua tren ty le dien day so ve
const getLowSalesAlert = (event, totalSold, totalCapacity) => {
  const now = new Date();
  const eventDate = new Date(event.date);
  const diffDays = Math.ceil((eventDate - now) / (24 * 60 * 60 * 1000));
  const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

  // Khong canh bao neu su kien da ket thuc hoac bi huy
  if (['ended', 'cancelled', 'rejected', 'draft'].includes(event.status)) {
    return null;
  }

  // Dat muc tieu ty le dien day theo so ngay con lai
  let expectedFillRate = 15;
  if (diffDays <= 3) expectedFillRate = 60;
  else if (diffDays <= 7) expectedFillRate = 40;
  else if (diffDays <= 14) expectedFillRate = 25;

  // Khong canh bao neu ty le dien day dat yeu cau
  if (fillRate >= expectedFillRate) {
    return null;
  }

  // Tra ve muc do canh bao
  return {
    isLow: true,
    expectedFillRate,
    actualFillRate: fillRate,
    severity: fillRate < Math.max(5, expectedFillRate / 2) ? 'danger' : 'warning',
    message:
      diffDays > 0
        ? `Sự kiện còn ${diffDays} ngày nữa diễn ra nhưng mới đạt ${fillRate}% sức chứa. Nên gửi nhắc nhở cho nhà tổ chức để thúc đẩy bán vé.`
        : `Sự kiện đang diễn ra nhưng mới đạt ${fillRate}% sức chứa. Cần cảnh báo nhà tổ chức ngay.`
  };
};

const AdminController = {
  // Tao su kien moi boi admin cho nha to chuc khac
  createEventByAdmin: [
    body('name').trim().isLength({ min: 5 }).withMessage('Tên sự kiện phải ít nhất 5 ký tự'),
    body('organizer').isMongoId().withMessage('Phải chọn nhà tổ chức (organizer) hợp lệ'),
    body('date').isISO8601().withMessage('Ngày tổ chức không đúng định dạng'),
    body('location').notEmpty().withMessage('Địa điểm không được để trống'),

    async (req, res) => {
      // Kiem tra loi validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        // Chi admin moi duoc phep tao su kien cho nguoi khac
        const isAdminUser = (req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdminUser) {
          return res.status(403).json({ success: false, message: 'Chỉ admin mới được tạo sự kiện cho người khác' });
        }

        // Lay thong tin nha to chuc va kiem tra vai tro
        const targetOrganizerId = req.body.organizer;
        const organizerExists = await User.findById(targetOrganizerId);
        const organizerRole = (organizerExists?.role || '').toLowerCase();
        if (!organizerExists || organizerRole !== 'organizer') {
          return res.status(400).json({ success: false, message: 'Nhà tổ chức không tồn tại hoặc vai trò không hợp lệ' });
        }

        // Su dung eventService de dam bao ticketTypes, seating, slug duoc xu ly dung
        // Su kien tao boi admin bat dau o trang thai 'draft' va phai duyet truoc khi publish
        const newEvent = await createUnifiedEvent({
          body: req.body,
          organizerId: targetOrganizerId,
          status: req.body.status || 'draft',
          files: req.files
        });

        // Ghi log hanh dong tao su kien
        logger.info(`Admin ${req.user.name} đã tạo sự kiện "${newEvent.name}" cho organizer ${targetOrganizerId}`);

        // Tra ve ket qua tao thanh cong
        res.status(201).json({
          success: true,
          message: `Tạo sự kiện thành công cho nhà tổ chức ${organizerExists.name}`,
          event: newEvent
        });
      } catch (err) {
        logger.error('Admin createEvent error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi máy chủ khi tạo sự kiện' });
      }
    }
  ],

  // Lay du lieu dashboard tong hop
  getDashboard: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        // Tinh toan khoang thoi gian 14 ngay truoc
        const now = new Date();
        const startDay = new Date(now);
        startDay.setDate(now.getDate() - 13);
        startDay.setHours(0, 0, 0, 0);

        // Lay song song nhieu du lieu thong ke
        const [
          totalEvents, totalUsers, totalRevenueData, ticketsSoldData,
          capacityData, trafficData, paidOrdersCount, recentEvents,
          revenueByDayData, ticketsByDayData, revenueByPaymentData,
          recentOrders, pendingCount, rejectedCount, upcomingCount,
          ongoingCount, endedCount
        ] = await Promise.all([
          // Dem tong so su kien
          Event.countDocuments({}),
          // Dem tong so nguoi dung
          User.countDocuments({}),
          // Tinh tong doanh thu tu don da thanh toan
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]),
          // Dem tong so ve da ban
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $unwind: '$items' },
            { $group: { _id: null, totalSold: { $sum: '$items.quantity' } } }
          ]),
          // Tinh tong suc chua tu tat ca loai ve
          Event.aggregate([
            { $unwind: { path: '$ticketTypes', preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, totalCapacity: { $sum: { $ifNull: ['$ticketTypes.quantity', 0] } } } }
          ]),
          // Tinh tong luot xem
          Event.aggregate([
            { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$views', 0] } } } }
          ]),
          // Dem so don da thanh toan
          Order.countDocuments({ status: 'PAID' }),
          // Lay 10 su kien moi nhat
          Event.find({}).sort({ createdAt: -1 }).limit(10).populate('organizer', 'name email').lean(),
          // Doanh thu theo tung ngay trong 14 ngay
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: '$totalAmount' } } },
            { $sort: { _id: 1 } }
          ]),
          // So ve ban theo tung ngay trong 14 ngay
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $unwind: '$items' },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, tickets: { $sum: '$items.quantity' } } },
            { $sort: { _id: 1 } }
          ]),
          // Doanh thu theo phuong thuc thanh toan
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: '$paymentMethod', total: { $sum: '$totalAmount' } } },
            { $sort: { total: -1 } }
          ]),
          // Lay 5 don hang moi nhat
          Order.find({}).sort({ createdAt: -1 }).limit(5).populate('userId', 'name').lean(),
          // Dem so su kien cho duyet
          Event.countDocuments({ status: 'pending' }),
          // Dem so su kien bi tu choi
          Event.countDocuments({ status: 'rejected' }),
          // Dem so su kien sap dien ra
          Event.countDocuments({ status: 'upcoming' }),
          // Dem so su kien dang dien ra
          Event.countDocuments({ status: 'ongoing' }),
          // Dem so su kien da ket thuc
          Event.countDocuments({ status: 'ended' })
        ]);

        // Tinh toan cac chi so tong hop
        const totalRevenue = totalRevenueData[0]?.total || 0;
        const ticketsSold = ticketsSoldData[0]?.totalSold || 0;
        const totalCapacity = capacityData[0]?.totalCapacity || 0;
        const traffic = trafficData[0]?.totalViews || 0;
        const fillRate = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;
        const conversionRate = traffic > 0 ? Number(((paidOrdersCount / traffic) * 100).toFixed(2)) : 0;

        // Chuan bi du lieu bieu do line cho 14 ngay
        const formatDate = (d) => d.toISOString().slice(0, 10);
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(startDay);
          d.setDate(startDay.getDate() + i);
          return d;
        });

        // Tao map de lay du lieu theo ngay
        const revenueMap = new Map(revenueByDayData.map(d => [d._id, d.revenue]));
        const ticketsMap = new Map(ticketsByDayData.map(d => [d._id, d.tickets]));
        const lineLabels = days.map(d => formatDate(d));
        const lineRevenue = lineLabels.map(l => revenueMap.get(l) || 0);
        const lineTickets = lineLabels.map(l => ticketsMap.get(l) || 0);

        // Chuan bi du lieu bieu do pie
        const pieLabels = (revenueByPaymentData || []).map(p => p._id || 'Không xác định');
        const pieValues = (revenueByPaymentData || []).map(p => p.total || 0);

        // Render trang dashboard
        res.render('admin/dashboard/index', {
          pageTitle: 'Bảng điều khiển quản trị',
          events: recentEvents || [],
          pendingCount, rejectedCount, upcomingCount, ongoingCount, endedCount,
          user: req.user,
          stats: { totalEvents, totalUsers, totalRevenue, ticketsSold, totalCapacity, fillRate, traffic, conversionRate },
          recentOrders: recentOrders || [],
          lineChart: { labels: lineLabels, revenue: lineRevenue, tickets: lineTickets },
          pieChart: { labels: pieLabels, values: pieValues }
        });
      } catch (err) {
        logger.error('Admin Dashboard Error:', err);
        // Render trang loi neu xay ra van de
        res.render('admin/dashboard/index', {
          pageTitle: 'Bảng điều khiển quản trị',
          user: req.user,
          stats: { totalEvents: 0, totalUsers: 0, totalRevenue: 0, ticketsSold: 0, totalCapacity: 0, fillRate: 0, traffic: 0, conversionRate: 0 },
          events: [], recentOrders: [],
          lineChart: { labels: [], revenue: [], tickets: [] },
          pieChart: { labels: [], values: [] },
          errorMessage: 'Không thể tải dữ liệu thống kê'
        });
      }
    }
  ],

  // Quan ly danh sach su kien
  manageEvents: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const q = (req.query.q || '').trim();
        const status = (req.query.status || '').trim();
        const dbQuery = {};

        if (status) {
          dbQuery.status = status;
        }

        if (q) {
          const safeKeyword = escapeRegex(q);
          dbQuery.$or = [
            { name: { $regex: safeKeyword, $options: 'i' } },
            { location: { $regex: safeKeyword, $options: 'i' } }
          ];
        }

        // Lay tat ca su kien sap sep theo thoi gian tao
        const events = await Event.find(dbQuery)
          .sort({ createdAt: -1 })
          .populate('organizer', 'name email')
          .lean();

        // Dem so su kien theo tung trang thai
        const [pendingCount, rejectedCount, upcomingCount, ongoingCount, endedCount] = await Promise.all([
          Event.countDocuments({ status: 'pending' }),
          Event.countDocuments({ status: 'rejected' }),
          Event.countDocuments({ status: 'upcoming' }),
          Event.countDocuments({ status: 'ongoing' }),
          Event.countDocuments({ status: 'ended' })
        ]);

        // Render trang quan ly su kien
        res.render('admin/dashboard/events', {
          pageTitle: 'Quản lý sự kiện',
          events: events || [],
          pendingCount, rejectedCount, upcomingCount, ongoingCount, endedCount,
          filters: { q, status },
          user: req.user
        });
      } catch (err) {
        logger.error('Lỗi tải danh sách sự kiện admin:', err);
        res.render('admin/dashboard/events', {
          pageTitle: 'Quản lý sự kiện',
          events: [],
          pendingCount: 0, rejectedCount: 0, upcomingCount: 0, ongoingCount: 0, endedCount: 0,
          filters: { q: '', status: '' },
          user: req.user,
          errorMessage: 'Không thể tải danh sách sự kiện'
        });
      }
    }
  ],

  // Quan ly don hang
  manageOrders: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        // Lay tham so phan trang va loc
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const status = (req.query.status || '').trim();
        const q = (req.query.q || '').trim().toLowerCase();

        // Tao query loc theo trang thai
        const dbQuery = {};
        if (status) dbQuery.status = status;

        // Lay don hang va dien thong tin nguoi dung, su kien
        const rawOrders = await Order.find(dbQuery)
          .sort({ createdAt: -1 })
          .populate('userId', 'name email')
          .populate('eventId', 'name')
          .lean();

        // Loc theo tu khoa tim kiem (ma don, ten, email, ten su kien)
        const filteredOrders = q
          ? rawOrders.filter((o) => {
              const orderId = String(o._id || '').toLowerCase();
              const userName = String(o.userId?.name || '').toLowerCase();
              const userEmail = String(o.userId?.email || '').toLowerCase();
              const eventName = String(o.eventId?.name || '').toLowerCase();
              return (
                orderId.includes(q) ||
                userName.includes(q) ||
                userEmail.includes(q) ||
                eventName.includes(q)
              );
            })
          : rawOrders;

        // Phan trang don hang
        const total = filteredOrders.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedOrders = filteredOrders.slice(start, end).map((o) => ({
          ...o,
          user: o.userId || null,
          event: o.eventId || null,
          totalItems: (o.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        }));

        // Dem don hang theo tung trang thai
        const [paidCount, processingCount, pendingCount, cancelledCount, expiredCount] = await Promise.all([
          Order.countDocuments({ status: 'PAID' }),
          Order.countDocuments({ status: 'PROCESSING' }),
          Order.countDocuments({ status: 'PENDING' }),
          Order.countDocuments({ status: 'CANCELLED' }),
          Order.countDocuments({ status: 'EXPIRED' })
        ]);

        // Render trang quan ly don hang
        return res.render('admin/dashboard/orders', {
          pageTitle: 'Quản lý đơn hàng',
          user: req.user,
          orders: pagedOrders,
          filters: { q: req.query.q || '', status: req.query.status || '' },
          stats: { paidCount, processingCount, pendingCount, cancelledCount, expiredCount },
          pagination: {
            page,
            totalPages: Math.max(1, Math.ceil(total / limit))
          }
        });
      } catch (err) {
        logger.error('Lỗi tải danh sách đơn hàng admin:', err);
        return res.render('admin/dashboard/orders', {
          pageTitle: 'Quản lý đơn hàng',
          user: req.user,
          orders: [],
          filters: { q: '', status: '' },
          stats: { paidCount: 0, processingCount: 0, pendingCount: 0, cancelledCount: 0, expiredCount: 0 },
          pagination: { page: 1, totalPages: 1 },
          errorMessage: 'Không thể tải danh sách đơn hàng'
        });
      }
    }
  ],

  // Phe duyet su kien
  approveEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { notes } = req.body;

        // Goi service de publish su kien
        const event = await publishEvent(eventId, req.user._id, notes);

        // Ghi log hanh dong duyet
        logger.info(`Admin ${req.user.name} đã duyệt sự kiện ${eventId}`);

        // Tra ve ket qua thanh cong
        res.json({ success: true, message: 'Sự kiện đã được phê duyệt thành công', event });
      } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi khi phê duyệt sự kiện' });
      }
    }
  ],

  // Phe duyet don hang va cap ve
  approveOrder: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { orderId } = req.params;

        const order = await approveOrder({
          orderId,
          adminId: req.user._id
        });

        logger.info(`Admin ${req.user.name} đã duyệt đơn hàng ${orderId}`);

        res.json({ success: true, message: 'Đã duyệt đơn hàng và cấp vé thành công', order });
      } catch (err) {
        logger.error('Approve order error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi khi phê duyệt đơn hàng' });
      }
    }
  ],

  // Tu choi su kien
  rejectEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { reason } = req.body;

        // Goi service de tu choi su kien
        const event = await rejectEventByAdmin(eventId, req.user._id, reason);

        // Ghi log hanh dong tu choi
        logger.info(`Admin ${req.user.name} đã từ chối sự kiện ${eventId}`);

        // Tra ve ket qua
        res.json({ success: true, message: 'Sự kiện đã bị từ chối' });
      } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi khi từ chối sự kiện' });
      }
    }
  ],

  // Xoa su kien
  deleteEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        // Kiem tra su kien ton tai
        const event = await Event.findById(eventId);
        if (!event) {
          return res.status(404).json({ success: false, message: 'Sự kiện không tồn tại' });
        }

        // Xoa tat ca du lieu lien quan (ve, don hang, danh gia, yeu thich)
        await Promise.all([
          Ticket.deleteMany({ event: eventId }),
          Order.deleteMany({ eventId }),
          EventReview.deleteMany({ eventId }),
          UserFavoriteEvent.deleteMany({ eventId })
        ]);

        // Xoa su kien chinh
        await Event.findByIdAndDelete(eventId);

        // Ghi log hanh dong xoa
        logger.info(`Admin ${req.user?.name || req.user?._id || 'unknown'} đã xóa sự kiện ${eventId}`);
        res.json({ success: true, message: 'Đã xóa sự kiện thành công' });
      } catch (err) {
        logger.error('Lỗi xóa sự kiện:', err);
        res.status(500).json({ success: false, message: err.message || 'Lỗi khi xóa sự kiện' });
      }
    }
  ],

  // Quan ly nguoi dung
  manageUsers: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        // Lay tham so phan trang va loc
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const role = (req.query.role || '').trim();
        const status = (req.query.status || '').trim();
        const q = (req.query.q || '').trim();

        // Tao query truy van theo cac truong loc
        const dbQuery = {};

        // Loc theo vai tro
        if (role) {
          dbQuery.role = exactRoleQuery(role);
        }

        // Loc theo trang thai hoat dong
        if (status === 'active') {
          dbQuery.isActive = true;
        } else if (status === 'inactive') {
          dbQuery.isActive = false;
        }

        // Tim kiem theo ten, email, so dien thoai
        if (q) {
          const safeKeyword = escapeRegex(q);
          dbQuery.$or = [
            { name: { $regex: safeKeyword, $options: 'i' } },
            { email: { $regex: safeKeyword, $options: 'i' } },
            { phone: { $regex: safeKeyword, $options: 'i' } }
          ];
        }

        // Lay tong so nguoi dung thoa man loc
        const total = await User.countDocuments(dbQuery);
        // Lay danh sach nguoi dung phan trang
        const users = await User.find(dbQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        // Dem so luong theo tung loai
        const [totalUsers, activeUsers, inactiveUsers, adminCount, organizerCount, userCount] = await Promise.all([
          User.countDocuments({}),
          User.countDocuments({ isActive: true }),
          User.countDocuments({ isActive: false }),
          User.countDocuments({ role: exactRoleQuery('admin') }),
          User.countDocuments({ role: exactRoleQuery('organizer') }),
          User.countDocuments({ role: exactRoleQuery('user') })
        ]);

        // Render trang quan ly nguoi dung
        return res.render('admin/dashboard/users', {
          pageTitle: 'Quản lý người dùng',
          user: req.user,
          users,
          filters: {
            q,
            role,
            status
          },
          stats: {
            totalUsers,
            activeUsers,
            inactiveUsers,
            adminCount,
            organizerCount,
            userCount
          },
          pagination: {
            page,
            totalPages: Math.max(1, Math.ceil(total / limit))
          }
        });
      } catch (err) {
        logger.error('Lỗi tải danh sách người dùng admin:', err);
        return res.render('admin/dashboard/users', {
          pageTitle: 'Quản lý người dùng',
          user: req.user,
          users: [],
          filters: { q: '', role: '', status: '' },
          stats: {
            totalUsers: 0,
            activeUsers: 0,
            inactiveUsers: 0,
            adminCount: 0,
            organizerCount: 0,
            userCount: 0
          },
          pagination: { page: 1, totalPages: 1 },
          errorMessage: 'Không thể tải danh sách người dùng'
        });
      }
    }
  ],

  // Xem chi tiet phan tich su kien
  manageEventDetail: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        // Lay thong tin su kien va nha to chuc
        const event = await Event.findById(eventId).populate('organizer', 'name email phone').lean();

        // Kiem tra su kien ton tai
        if (!event) {
          return res.status(404).render('clients/page/error/404', {
            pageTitle: 'Không tìm thấy sự kiện',
            message: 'Sự kiện không tồn tại hoặc đã bị xóa'
          });
        }

        // Lay danh sach don hang da thanh toan
        const paidOrders = await Order.find({ eventId, status: 'PAID' }).sort({ createdAt: -1 }).lean();
        // Dem don hang theo tung trang thai va lay thong bao gan day
        const [pendingOrdersCount, cancelledOrdersCount, expiredOrdersCount, recentNotifications] = await Promise.all([
          Order.countDocuments({ eventId, status: 'PENDING' }),
          Order.countDocuments({ eventId, status: 'CANCELLED' }),
          Order.countDocuments({ eventId, status: 'EXPIRED' }),
          Notification.find({ eventId }).sort({ createdAt: -1 }).limit(8).lean()
        ]);

        // Tinh toan chi so thong ke cho tung loai ve
        const ticketTypeStats = (event.ticketTypes || []).map((ticketType) => {
          const quantity = Number(ticketType.quantity || 0);
          const sold = Number(ticketType.sold || 0);
          const holded = Number(ticketType.holded || 0);
          // Tinh so ve con lai
          const available = Math.max(0, quantity - sold - holded);
          // Tinh doanh thu uoc tinh
          const revenue = sold * Number(ticketType.price || 0);
          // Tinh ty le dien day
          const fillRate = quantity > 0 ? Math.round((sold / quantity) * 100) : 0;

          return {
            _id: ticketType._id,
            type: ticketType.type,
            price: Number(ticketType.price || 0),
            quantity,
            sold,
            holded,
            available,
            revenue,
            fillRate
          };
        });

        // Tinh tong hop cac chi so
        const totalCapacity = ticketTypeStats.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold = ticketTypeStats.reduce((sum, item) => sum + item.sold, 0);
        const totalHeld = ticketTypeStats.reduce((sum, item) => sum + item.holded, 0);
        const totalAvailable = ticketTypeStats.reduce((sum, item) => sum + item.available, 0);
        const totalRevenue = ticketTypeStats.reduce((sum, item) => sum + item.revenue, 0);
        const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

        // Lay du lieu 14 ngay cho bieu do
        const { startDay, labels } = buildLast14Days();
        // Doanh thu theo tung ngay
        const revenueByDayData = await Order.aggregate([
          { $match: { eventId: event._id, status: 'PAID', createdAt: { $gte: startDay } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              revenue: { $sum: '$totalAmount' }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        // So ve ban theo tung ngay
        const ticketsByDayData = await Order.aggregate([
          { $match: { eventId: event._id, status: 'PAID', createdAt: { $gte: startDay } } },
          { $unwind: '$items' },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              tickets: { $sum: '$items.quantity' }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        // Tao map de map du lieu theo ngay
        const revenueMap = new Map(revenueByDayData.map((item) => [item._id, item.revenue]));
        const ticketsMap = new Map(ticketsByDayData.map((item) => [item._id, item.tickets]));
        // Kiem tra canh bao ban ve cham
        const lowSalesAlert = getLowSalesAlert(event, totalSold, totalCapacity);

        // Render trang chi tiet phan tich
        return res.render('admin/dashboard/event-detail', {
          pageTitle: `Phân tích sự kiện - ${event.name}`,
          user: req.user,
          event,
          stats: {
            totalCapacity,
            totalSold,
            totalHeld,
            totalAvailable,
            totalRevenue,
            fillRate,
            paidOrdersCount: paidOrders.length,
            pendingOrdersCount,
            cancelledOrdersCount,
            expiredOrdersCount
          },
          ticketTypeStats,
          recentNotifications,
          recentPaidOrders: paidOrders.slice(0, 8),
          lowSalesAlert,
          lineChart: {
            labels,
            revenue: labels.map((label) => revenueMap.get(label) || 0),
            tickets: labels.map((label) => ticketsMap.get(label) || 0)
          },
          ticketChart: {
            labels: ticketTypeStats.map((item) => item.type),
            sold: ticketTypeStats.map((item) => item.sold),
            remaining: ticketTypeStats.map((item) => item.available),
            revenue: ticketTypeStats.map((item) => item.revenue)
          }
        });
      } catch (err) {
        logger.error('Lỗi tải chi tiết phân tích sự kiện:', err);
        return res.status(500).render('clients/page/error/500', {
          pageTitle: 'Lỗi máy chủ',
          message: 'Không thể tải trang phân tích sự kiện'
        });
      }
    }
  ],

  // Gui thong bao cho nha to chuc ve su kien
  notifyOrganizerAboutEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        // Lay thong tin su kien va nha to chuc
        const event = await Event.findById(eventId).populate('organizer', 'name email');

        // Kiem tra su kien ton tai
        if (!event) {
          return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện' });
        }

        // Kiem tra nha to chuc hop le
        if (!event.organizer?._id) {
          return res.status(400).json({ success: false, message: 'Sự kiện chưa có nhà tổ chức hợp lệ' });
        }

        // Tinh toan chi so ban hang
        const ticketTypeStats = (event.ticketTypes || []).map((ticketType) => ({
          quantity: Number(ticketType.quantity || 0),
          sold: Number(ticketType.sold || 0),
          revenue: Number(ticketType.sold || 0) * Number(ticketType.price || 0)
        }));

        const totalCapacity = ticketTypeStats.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold = ticketTypeStats.reduce((sum, item) => sum + item.sold, 0);
        const totalRevenue = ticketTypeStats.reduce((sum, item) => sum + item.revenue, 0);
        const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
        // Kiem tra canh bao ban ve cham
        const lowSalesAlert = getLowSalesAlert(event, totalSold, totalCapacity);

        // Tao tieu de va noi dung thong bao
        const title = lowSalesAlert
          ? `Canh bao ban ve cham - ${event.name}`
          : `Cap nhat doanh so ve - ${event.name}`;
        const message = lowSalesAlert
          ? `Su kien "${event.name}" dang ban cham. Da ban ${totalSold}/${totalCapacity} ve (${fillRate}%). Doanh thu tam tinh ${Number(totalRevenue).toLocaleString('vi-VN')} d.`
          : `Cap nhat hien tai cho su kien "${event.name}": da ban ${totalSold}/${totalCapacity} ve (${fillRate}%). Doanh thu tam tinh ${Number(totalRevenue).toLocaleString('vi-VN')} d.`;

        // Tao thong bao trong he thong
        const notification = await Notification.create({
          userId: event.organizer._id,
          eventId: event._id,
          type: lowSalesAlert ? 'low_sales_warning' : 'sales_update',
          title,
          message,
          meta: {
            totalSold,
            totalCapacity,
            fillRate,
            totalRevenue
          }
        });

        // Ghi log hanh dong gui thong bao
        logger.info(
          `Admin ${req.user?.name || req.user?._id || 'unknown'} đã gửi thông báo sự kiện ${eventId} cho organizer ${event.organizer._id}`
        );

        // Tra ve ket qua
        return res.json({
          success: true,
          message: lowSalesAlert
            ? 'Đã gửi cảnh báo bán chậm cho nhà tổ chức'
            : 'Đã gửi cập nhật doanh số vé cho nhà tổ chức',
          notification
        });
      } catch (err) {
        logger.error('Lỗi gửi thông báo cho organizer:', err);
        return res.status(500).json({ success: false, message: 'Không thể gửi thông báo cho nhà tổ chức' });
      }
    }
  ],

  // Khoa/mo khoa tai khoan nguoi dung
  toggleUserStatus: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        // Tim nguoi dung can cap nhat
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });

        // Dao nguoc trang thai kich hoat
        user.isActive = !user.isActive;
        await user.save();

        // Tra ve ket qua
        res.json({
          success: true,
          message: `Đã ${user.isActive ? 'mở khóa' : 'khóa'} tài khoản thành công`
        });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi cập nhật trạng thái người dùng' });
      }
    }
  ],

  // ============================================================
  // QUAN LY RUT TIEN (WITHDRAWAL)
  // ============================================================

  // Trang danh sach yeu cau rut tien
  manageWithdrawals: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 15;
        const status = (req.query.status || '').trim();

        const { withdrawals, pagination } = await getWithdrawals({
          page,
          limit,
          status
        });

        // Dem theo trang thai
        const [pendingCount, approvedCount, rejectedCount, completedCount] = await Promise.all([
          Withdrawal.countDocuments({ status: 'PENDING' }),
          Withdrawal.countDocuments({ status: 'APPROVED' }),
          Withdrawal.countDocuments({ status: 'REJECTED' }),
          Withdrawal.countDocuments({ status: 'COMPLETED' })
        ]);

        res.render('admin/dashboard/withdrawals', {
          pageTitle: 'Quản lý rút tiền',
          user: req.user,
          withdrawals,
          filters: { status },
          stats: { pendingCount, approvedCount, rejectedCount, completedCount },
          pagination
        });
      } catch (err) {
        logger.error('Manage withdrawals error:', err);
        res.render('admin/dashboard/withdrawals', {
          pageTitle: 'Quản lý rút tiền',
          user: req.user,
          withdrawals: [],
          filters: { status: '' },
          stats: { pendingCount: 0, approvedCount: 0, rejectedCount: 0, completedCount: 0 },
          pagination: { page: 1, totalPages: 1 },
          errorMessage: 'Không thể tải danh sách yêu cầu rút tiền'
        });
      }
    }
  ],

  // Api: Lay danh sach yeu cau rut tien (JSON)
  getWithdrawalsApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 15;
        const status = (req.query.status || '').trim();

        const result = await getWithdrawals({ page, limit, status });
        res.json({ success: true, ...result });
      } catch (err) {
        logger.error('Get withdrawals API error:', err);
        res.status(500).json({ success: false, message: err.message });
      }
    }
  ],

  // Api: Duyet yeu cau rut tien
  approveWithdrawalApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { withdrawalId } = req.params;
        const { adminNote } = req.body;

        const withdrawal = await approveWithdrawal({
          withdrawalId,
          adminId: req.user._id,
          adminNote
        });

        logger.info(`Admin ${req.user.name} approved withdrawal ${withdrawalId}`);

        res.json({ success: true, message: 'Đã duyệt yêu cầu rút tiền', withdrawal });
      } catch (err) {
        logger.error('Approve withdrawal error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // Api: Tu choi yeu cau rut tien
  rejectWithdrawalApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { withdrawalId } = req.params;
        const { reason } = req.body;

        const withdrawal = await rejectWithdrawal({
          withdrawalId,
          adminId: req.user._id,
          reason
        });

        logger.info(`Admin ${req.user.name} rejected withdrawal ${withdrawalId}`);

        res.json({ success: true, message: 'Đã từ chối yêu cầu rút tiền', withdrawal });
      } catch (err) {
        logger.error('Reject withdrawal error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // ============================================================
  // SETTLEMENT MANAGEMENT
  // ============================================================

  // Trang tổng quan settlement
  manageSettlements: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 15;
        const status = (req.query.status || '').trim();

        const { settlements, pagination } = await getSettlements({
          page,
          limit,
          status
        });

        const stats = await getSettlementStats();
        const organizers = await getOrganizersWithEarnings();

        res.render('admin/dashboard/settlements', {
          pageTitle: 'Quản lý Đối soát',
          user: req.user,
          settlements,
          stats,
          organizers,
          filters: { status },
          pagination
        });
      } catch (err) {
        logger.error('Manage settlements error:', err);
        res.render('admin/dashboard/settlements', {
          pageTitle: 'Quản lý Đối soát',
          user: req.user,
          settlements: [],
          stats: { totalSettlements: 0, pendingCount: 0, approvedCount: 0, completedCount: 0, totalCommission: 0, totalNetPaid: 0 },
          organizers: [],
          filters: { status: '' },
          pagination: { page: 1, totalPages: 1 },
          errorMessage: 'Không thể tải dữ liệu đối soát'
        });
      }
    }
  ],

  // Api: Tạo settlement cho organizer
  createSettlementApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { organizerId, eventId, periodStart, periodEnd, adminNote } = req.body;

        const settlement = await createSettlement({
          organizerId,
          eventId: eventId || null,
          periodStart,
          periodEnd,
          createdBy: req.user._id,
          adminNote
        });

        logger.info(`Admin ${req.user.name} created settlement for organizer ${organizerId}`);

        res.json({ success: true, message: 'Đã tạo đối soát thành công', settlement });
      } catch (err) {
        logger.error('Create settlement error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // Api: Duyệt settlement
  approveSettlementApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { settlementId } = req.params;
        const { adminNote } = req.body;

        const settlement = await approveSettlement({
          settlementId,
          adminId: req.user._id,
          adminNote
        });

        logger.info(`Admin ${req.user.name} approved settlement ${settlementId}`);

        res.json({ success: true, message: 'Đã duyệt đối soát', settlement });
      } catch (err) {
        logger.error('Approve settlement error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // Api: Hoàn thành settlement (đã chuyển tiền)
  completeSettlementApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { settlementId } = req.params;

        const settlement = await completeSettlement({
          settlementId,
          adminId: req.user._id
        });

        logger.info(`Admin ${req.user.name} completed settlement ${settlementId}`);

        res.json({ success: true, message: 'Đã hoàn thành đối soát và chuyển tiền', settlement });
      } catch (err) {
        logger.error('Complete settlement error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // Api: Hủy settlement
  cancelSettlementApi: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { settlementId } = req.params;
        const { reason } = req.body;

        const settlement = await cancelSettlement({
          settlementId,
          adminId: req.user._id,
          reason
        });

        logger.info(`Admin ${req.user.name} cancelled settlement ${settlementId}`);

        res.json({ success: true, message: 'Đã hủy đối soát', settlement });
      } catch (err) {
        logger.error('Cancel settlement error:', err);
        res.status(err.status || 500).json({ success: false, message: err.message });
      }
    }
  ],

  // Lay danh sach nhap ký he thong
  getLogs: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        // Lay tham so phan trang
        const page = Number.parseInt(req.query.page) || 1;
        const limit = 20;

        // Lay danh sach log phan trang
        const logs = await AuditLog.find({})
          .populate('adminId', 'name')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);

        // Dem tong so log
        const total = await AuditLog.countDocuments({});

        // Render trang quan ly log
        res.render('admin/logs', {
          pageTitle: 'Quản lý Nhật ký hệ thống (Logs)',
          logs,
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });
      } catch (err) {
        res.status(500).send('Lỗi khi lấy dữ liệu nhật ký');
      }
    }
  ]
};

export default AdminController;
