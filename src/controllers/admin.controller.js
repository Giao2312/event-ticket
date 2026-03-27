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
import logger from '../utils/logger.js';
import {
  createUnifiedEvent,
  publishEvent,
  rejectEventByAdmin
} from '../services/event.service.js';

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

const getLowSalesAlert = (event, totalSold, totalCapacity) => {
  const now = new Date();
  const eventDate = new Date(event.date);
  const diffDays = Math.ceil((eventDate - now) / (24 * 60 * 60 * 1000));
  const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

  if (['ended', 'cancelled', 'rejected', 'draft'].includes(event.status)) {
    return null;
  }

  let expectedFillRate = 15;
  if (diffDays <= 3) expectedFillRate = 60;
  else if (diffDays <= 7) expectedFillRate = 40;
  else if (diffDays <= 14) expectedFillRate = 25;

  if (fillRate >= expectedFillRate) {
    return null;
  }

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
  createEventByAdmin: [
    body('name').trim().isLength({ min: 5 }).withMessage('Tên sự kiện phải ít nhất 5 ký tự'),
    body('organizer').isMongoId().withMessage('Phải chọn nhà tổ chức (organizer) hợp lệ'),
    body('date').isISO8601().withMessage('Ngày tổ chức không đúng định dạng'),
    body('location').notEmpty().withMessage('Địa điểm không được để trống'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        const isAdminUser = (req.user?.role || '').toLowerCase() === 'admin';
        if (!isAdminUser) {
          return res.status(403).json({ success: false, message: 'Chỉ admin mới được tạo sự kiện cho người khác' });
        }

        const targetOrganizerId = req.body.organizer;
        const organizerExists = await User.findById(targetOrganizerId);
        const organizerRole = (organizerExists?.role || '').toLowerCase();
        if (!organizerExists || organizerRole !== 'organizer') {
          return res.status(400).json({ success: false, message: 'Nhà tổ chức không tồn tại hoặc vai trò không hợp lệ' });
        }

        // Route through eventService so ticketTypes, seating, slug, and lifecycle are correct.
        // Admin-created events start as 'draft' so they must go through approval before becoming published.
        const newEvent = await createUnifiedEvent({
          body: req.body,
          organizerId: targetOrganizerId,
          status: req.body.status || 'draft',
          files: req.files
        });

        logger.info(`Admin ${req.user.name} đã tạo sự kiện "${newEvent.name}" cho organizer ${targetOrganizerId}`);

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

  getDashboard: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const now = new Date();
        const startDay = new Date(now);
        startDay.setDate(now.getDate() - 13);
        startDay.setHours(0, 0, 0, 0);

        const [
          totalEvents, totalUsers, totalRevenueData, ticketsSoldData,
          capacityData, trafficData, paidOrdersCount, recentEvents,
          revenueByDayData, ticketsByDayData, revenueByPaymentData,
          recentOrders, pendingCount, rejectedCount, upcomingCount,
          ongoingCount, endedCount
        ] = await Promise.all([
          Event.countDocuments({}),
          User.countDocuments({}),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $unwind: '$items' },
            { $group: { _id: null, totalSold: { $sum: '$items.quantity' } } }
          ]),
          Event.aggregate([
            { $unwind: { path: '$ticketTypes', preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, totalCapacity: { $sum: { $ifNull: ['$ticketTypes.quantity', 0] } } } }
          ]),
          Event.aggregate([
            { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$views', 0] } } } }
          ]),
          Order.countDocuments({ status: 'PAID' }),
          Event.find({}).sort({ createdAt: -1 }).limit(10).populate('organizer', 'name').lean(),
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: '$totalAmount' } } },
            { $sort: { _id: 1 } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $unwind: '$items' },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, tickets: { $sum: '$items.quantity' } } },
            { $sort: { _id: 1 } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: '$paymentMethod', total: { $sum: '$totalAmount' } } },
            { $sort: { total: -1 } }
          ]),
          Order.find({}).sort({ createdAt: -1 }).limit(5).populate('userId', 'name').lean(),
          Event.countDocuments({ status: 'pending' }),
          Event.countDocuments({ status: 'rejected' }),
          Event.countDocuments({ status: 'upcoming' }),
          Event.countDocuments({ status: 'ongoing' }),
          Event.countDocuments({ status: 'ended' })
        ]);

        const totalRevenue = totalRevenueData[0]?.total || 0;
        const ticketsSold = ticketsSoldData[0]?.totalSold || 0;
        const totalCapacity = capacityData[0]?.totalCapacity || 0;
        const traffic = trafficData[0]?.totalViews || 0;
        const fillRate = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;
        const conversionRate = traffic > 0 ? Number(((paidOrdersCount / traffic) * 100).toFixed(2)) : 0;

        const formatDate = (d) => d.toISOString().slice(0, 10);
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(startDay);
          d.setDate(startDay.getDate() + i);
          return d;
        });

        const revenueMap = new Map(revenueByDayData.map(d => [d._id, d.revenue]));
        const ticketsMap = new Map(ticketsByDayData.map(d => [d._id, d.tickets]));
        const lineLabels = days.map(d => formatDate(d));
        const lineRevenue = lineLabels.map(l => revenueMap.get(l) || 0);
        const lineTickets = lineLabels.map(l => ticketsMap.get(l) || 0);

        const pieLabels = (revenueByPaymentData || []).map(p => p._id || 'Không xác định');
        const pieValues = (revenueByPaymentData || []).map(p => p.total || 0);

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

  manageEvents: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const events = await Event.find({})
          .sort({ createdAt: -1 })
          .populate('organizer', 'name email')
          .lean();

        const [pendingCount, rejectedCount, upcomingCount, ongoingCount, endedCount] = await Promise.all([
          Event.countDocuments({ status: 'pending' }),
          Event.countDocuments({ status: 'rejected' }),
          Event.countDocuments({ status: 'upcoming' }),
          Event.countDocuments({ status: 'ongoing' }),
          Event.countDocuments({ status: 'ended' })
        ]);

        res.render('admin/dashboard/events', {
          pageTitle: 'Quản lý sự kiện',
          events: events || [],
          pendingCount, rejectedCount, upcomingCount, ongoingCount, endedCount,
          user: req.user
        });
      } catch (err) {
        logger.error('Lỗi tải danh sách sự kiện admin:', err);
        res.render('admin/dashboard/events', {
          pageTitle: 'Quản lý sự kiện',
          events: [],
          pendingCount: 0, rejectedCount: 0, upcomingCount: 0, ongoingCount: 0, endedCount: 0,
          user: req.user,
          errorMessage: 'Không thể tải danh sách sự kiện'
        });
      }
    }
  ],

  manageOrders: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const status = (req.query.status || '').trim();
        const q = (req.query.q || '').trim().toLowerCase();

        const dbQuery = {};
        if (status) dbQuery.status = status;

        const rawOrders = await Order.find(dbQuery)
          .sort({ createdAt: -1 })
          .populate('userId', 'name email')
          .populate('eventId', 'name')
          .lean();

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

        const total = filteredOrders.length;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedOrders = filteredOrders.slice(start, end).map((o) => ({
          ...o,
          user: o.userId || null,
          event: o.eventId || null,
          totalItems: (o.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        }));

        const [paidCount, pendingCount, cancelledCount, expiredCount] = await Promise.all([
          Order.countDocuments({ status: 'PAID' }),
          Order.countDocuments({ status: 'PENDING' }),
          Order.countDocuments({ status: 'CANCELLED' }),
          Order.countDocuments({ status: 'EXPIRED' })
        ]);

        return res.render('admin/dashboard/orders', {
          pageTitle: 'Quản lý đơn hàng',
          user: req.user,
          orders: pagedOrders,
          filters: { q: req.query.q || '', status: req.query.status || '' },
          stats: { paidCount, pendingCount, cancelledCount, expiredCount },
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
          stats: { paidCount: 0, pendingCount: 0, cancelledCount: 0, expiredCount: 0 },
          pagination: { page: 1, totalPages: 1 },
          errorMessage: 'Không thể tải danh sách đơn hàng'
        });
      }
    }
  ],

  approveEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { notes } = req.body;

        const event = await publishEvent(eventId, req.user._id, notes);

        logger.info(`Admin ${req.user.name} đã duyệt sự kiện ${eventId}`);

        res.json({ success: true, message: 'Sự kiện đã được phê duyệt thành công', event });
      } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi khi phê duyệt sự kiện' });
      }
    }
  ],

  rejectEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { reason } = req.body;

        const event = await rejectEventByAdmin(eventId, req.user._id, reason);

        logger.info(`Admin ${req.user.name} đã từ chối sự kiện ${eventId}`);

        res.json({ success: true, message: 'Sự kiện đã bị từ chối' });
      } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi khi từ chối sự kiện' });
      }
    }
  ],

  deleteEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const event = await Event.findById(eventId);
        if (!event) {
          return res.status(404).json({ success: false, message: 'Sự kiện không tồn tại' });
        }

        await Promise.all([
          Ticket.deleteMany({ event: eventId }),
          Order.deleteMany({ eventId }),
          EventReview.deleteMany({ eventId }),
          UserFavoriteEvent.deleteMany({ eventId })
        ]);

        await Event.findByIdAndDelete(eventId);

        logger.info(`Admin ${req.user?.name || req.user?._id || 'unknown'} đã xóa sự kiện ${eventId}`);
        res.json({ success: true, message: 'Đã xóa sự kiện thành công' });
      } catch (err) {
        logger.error('Lỗi xóa sự kiện:', err);
        res.status(500).json({ success: false, message: err.message || 'Lỗi khi xóa sự kiện' });
      }
    }
  ],

  manageUsers: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = 10;
        const role = (req.query.role || '').trim();
        const status = (req.query.status || '').trim();
        const q = (req.query.q || '').trim();

        const dbQuery = {};

        if (role) {
          dbQuery.role = role;
        }

        if (status === 'active') {
          dbQuery.isActive = true;
        } else if (status === 'inactive') {
          dbQuery.isActive = false;
        }

        if (q) {
          dbQuery.$or = [
            { name: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
            { phone: { $regex: q, $options: 'i' } }
          ];
        }

        const total = await User.countDocuments(dbQuery);
        const users = await User.find(dbQuery)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean();

        const [totalUsers, activeUsers, inactiveUsers, adminCount, organizerCount, userCount] = await Promise.all([
          User.countDocuments({}),
          User.countDocuments({ isActive: true }),
          User.countDocuments({ isActive: false }),
          User.countDocuments({ role: 'admin' }),
          User.countDocuments({ role: 'Organizer' }),
          User.countDocuments({ role: 'user' })
        ]);

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

  manageEventDetail: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const event = await Event.findById(eventId).populate('organizer', 'name email phone').lean();

        if (!event) {
          return res.status(404).render('clients/page/error/404', {
            pageTitle: 'Không tìm thấy sự kiện',
            message: 'Sự kiện không tồn tại hoặc đã bị xóa'
          });
        }

        const paidOrders = await Order.find({ eventId, status: 'PAID' }).sort({ createdAt: -1 }).lean();
        const [pendingOrdersCount, cancelledOrdersCount, expiredOrdersCount, recentNotifications] = await Promise.all([
          Order.countDocuments({ eventId, status: 'PENDING' }),
          Order.countDocuments({ eventId, status: 'CANCELLED' }),
          Order.countDocuments({ eventId, status: 'EXPIRED' }),
          Notification.find({ eventId }).sort({ createdAt: -1 }).limit(8).lean()
        ]);

        const ticketTypeStats = (event.ticketTypes || []).map((ticketType) => {
          const quantity = Number(ticketType.quantity || 0);
          const sold = Number(ticketType.sold || 0);
          const holded = Number(ticketType.holded || 0);
          const available = Math.max(0, quantity - sold - holded);
          const revenue = sold * Number(ticketType.price || 0);
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

        const totalCapacity = ticketTypeStats.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold = ticketTypeStats.reduce((sum, item) => sum + item.sold, 0);
        const totalHeld = ticketTypeStats.reduce((sum, item) => sum + item.holded, 0);
        const totalAvailable = ticketTypeStats.reduce((sum, item) => sum + item.available, 0);
        const totalRevenue = ticketTypeStats.reduce((sum, item) => sum + item.revenue, 0);
        const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

        const { startDay, labels } = buildLast14Days();
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

        const revenueMap = new Map(revenueByDayData.map((item) => [item._id, item.revenue]));
        const ticketsMap = new Map(ticketsByDayData.map((item) => [item._id, item.tickets]));
        const lowSalesAlert = getLowSalesAlert(event, totalSold, totalCapacity);

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

  notifyOrganizerAboutEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const event = await Event.findById(eventId).populate('organizer', 'name email');

        if (!event) {
          return res.status(404).json({ success: false, message: 'Không tìm thấy sự kiện' });
        }

        if (!event.organizer?._id) {
          return res.status(400).json({ success: false, message: 'Sự kiện chưa có nhà tổ chức hợp lệ' });
        }

        const ticketTypeStats = (event.ticketTypes || []).map((ticketType) => ({
          quantity: Number(ticketType.quantity || 0),
          sold: Number(ticketType.sold || 0),
          revenue: Number(ticketType.sold || 0) * Number(ticketType.price || 0)
        }));

        const totalCapacity = ticketTypeStats.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold = ticketTypeStats.reduce((sum, item) => sum + item.sold, 0);
        const totalRevenue = ticketTypeStats.reduce((sum, item) => sum + item.revenue, 0);
        const fillRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;
        const lowSalesAlert = getLowSalesAlert(event, totalSold, totalCapacity);

        const title = lowSalesAlert
          ? `Canh bao ban ve cham - ${event.name}`
          : `Cap nhat doanh so ve - ${event.name}`;
        const message = lowSalesAlert
          ? `Su kien "${event.name}" dang ban cham. Da ban ${totalSold}/${totalCapacity} ve (${fillRate}%). Doanh thu tam tinh ${Number(totalRevenue).toLocaleString('vi-VN')} d.`
          : `Cap nhat hien tai cho su kien "${event.name}": da ban ${totalSold}/${totalCapacity} ve (${fillRate}%). Doanh thu tam tinh ${Number(totalRevenue).toLocaleString('vi-VN')} d.`;

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

        logger.info(
          `Admin ${req.user?.name || req.user?._id || 'unknown'} đã gửi thông báo sự kiện ${eventId} cho organizer ${event.organizer._id}`
        );

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

  toggleUserStatus: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });

        user.isActive = !user.isActive;
        await user.save();

        res.json({ 
          success: true, 
          message: `Đã ${user.isActive ? 'mở khóa' : 'khóa'} tài khoản thành công` 
        });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi hệ thống khi cập nhật trạng thái người dùng' });
      }
    }
  ],

  getLogs: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const logs = await AuditLog.find({})
          .populate('adminId', 'name')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);

        const total = await AuditLog.countDocuments({});

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
