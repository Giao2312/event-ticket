import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Notification from '../models/notification.models.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';
import { createUnifiedEvent } from '../services/event.service.js';

const sendAdminNotification = async () => {};

const OrganizerOrderController = {
  getEventsPage: async (req, res) => {
    try {
      const notifications = await Notification.find({ userId: req.user._id })
        .populate('eventId', 'name')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

      const events = await Event.find({ organizer: req.user._id }).sort({ date: 1 }).lean();

      res.render('organizer/dashboard/events/detail', {
        pageTitle: 'Trang sự kiện nhà tổ chức',
        events,
        notifications,
        created: req.query.created === '1'
      });
    } catch (err) {
      logger.error('Organizer getEventsPage error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  createEvent: [
    body('name').trim().isLength({ min: 5 }).withMessage('Tên sự kiện tối thiểu 5 ký tự'),
    body('description')
      .trim()
      .isLength({ min: 20 })
      .withMessage('Mô tả sự kiện cần chi tiết hơn'),
    body('dateStart').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      try {
        if ((req.user.role || '').toLowerCase() !== 'organizer') {
          return res.status(403).json({
            success: false,
            message: 'Chỉ organizer mới được tạo sự kiện'
          });
        }

        const newEvent = await createUnifiedEvent({
          body: req.body,
          organizerId: req.user._id,
          status: 'pending',
          files: req.files
        });

        await sendAdminNotification({
          type: 'new_event_pending',
          eventId: newEvent._id,
          eventName: newEvent.name,
          organizerName: req.user.name
        });

        logger.info(
          `Organizer ${req.user.name} tạo sự kiện mới "${newEvent.name}" - seating=${newEvent.seating?.mode || 'general_admission'}`
        );

        return res.redirect('/organizer/events?created=1');
      } catch (err) {
        logger.error('Organizer createEvent error:', err);
        return res.status(err.status || 500).json({
          success: false,
          message: err.message || 'Lỗi server khi tạo sự kiện'
        });
      }
    }
  ],

  getOrders: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;
      const statusFilter = req.query.status || 'all';

      const myEventIds = await Event.find({ organizer: req.user.id }).distinct('_id');
      const query = { eventId: { $in: myEventIds } };

      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      const [orders, total, statsData] = await Promise.all([
        Order.find(query)
          .populate('userId', 'name avatar')
          .populate('eventId', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Order.countDocuments(query),
        Order.aggregate([
          { $match: { eventId: { $in: myEventIds } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
              pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
              totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$totalAmount', 0] } }
            }
          }
        ])
      ]);

      const stats =
        statsData[0] || { totalOrders: 0, paidOrders: 0, pendingOrders: 0, totalRevenue: 0 };

      res.render('organizer/dashboard/order/index', {
        pageTitle: 'Quản lý đơn hàng',
        orders,
        stats,
        statusFilter,
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      logger.error('Organizer getOrders error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  getSalesHistory: async (req, res) => {
    try {
      const myEvents = await Event.find({ organizer: req.user.id }).distinct('_id');

      const orders = await Order.find({ eventId: { $in: myEvents } })
        .populate('userId', 'name email')
        .populate('eventId', 'name')
        .sort({ createdAt: -1 });

      const stats = {
        totalOrders: orders.length,
        paidOrders: orders.filter((order) => order.status === 'PAID').length
      };

      res.render('organizer/dashboard/order/index', {
        pageTitle: 'Lịch sử bán hàng',
        orders,
        stats
      });
    } catch (error) {
      logger.error('Organizer getSalesHistory error:', error);
      res.status(500).send('Lỗi truy xuất dữ liệu bán hàng');
    }
  }
};

export default OrganizerOrderController;
