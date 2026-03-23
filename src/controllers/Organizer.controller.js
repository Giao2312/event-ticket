
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import { body, validationResult } from 'express-validator';
import logger from '../utils/logger.js';
import slugify from 'slugify';

const sendAdminNotification = async () => {};

const OrganizerOrderController = {
  getEventsPage: async (req, res) => {
    try {
      const events = await Event.find({ organizer: req.user._id })
        .sort({ date: 1 })
        .lean();

      res.render('organizer/dashboard/events/detail', {
        pageTitle: 'Trang Sự kiện Nhà tổ chức',
        events,
        created: req.query.created === '1'
      });
    } catch (err) {
      logger.error('Organizer getEventsPage error:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  createEvent: [

    body('name').trim().isLength({ min: 5 }).withMessage('Tên sự kiện tối thiểu 5 ký tự'),
    body('date').isISO8601().withMessage('Ngày không hợp lệ'),
    body('location').notEmpty(),
    body('capacity').isInt({ min: 1 }),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      try {
        const organizerId = req.user._id;                    

        if (req.user.role !== 'organizer') {
          return res.status(403).json({ success: false, message: 'Chỉ organizer mới được tạo sự kiện' });
        }

        const normalizeTickets = (input) => {
          if (!input) return [];
          const list = Array.isArray(input) ? input : Object.values(input);
          return list
            .map(t => ({
              type: t?.type,
              price: Number(t?.price),
              quantity: Number(t?.quantity)
            }))
            .filter(t => t.type && Number.isFinite(t.price) && t.price >= 0 && Number.isFinite(t.quantity) && t.quantity > 0);
        };

        const ticketTypes = normalizeTickets(req.body.tickets);

        const eventData = {
          ...req.body,
          ticketTypes,
          organizer: organizerId,
          status: 'pending',                                  
          slug: slugify(`${req.body.name}-${Date.now()}`, { lower: true }),
          image: req.file ? `/uploads/${req.file.filename}` : null
        };

        delete eventData.tickets;

        const newEvent = await Event.create(eventData);

      // Gửi thông báo cho admin (email hoặc in-app notification)
      // Ví dụ: dùng nodemailer hoặc socket.io
      await sendAdminNotification({
        type: 'new_event_pending',
        eventId: newEvent._id,
        eventName: newEvent.name,
        organizerName: req.user.name
      });

      logger.info(`Organizer ${req.user.name} tạo sự kiện mới "${newEvent.name}" - đang chờ duyệt`);

      return res.redirect('/organizer/events?created=1');
      } catch (err) {
        logger.error('Organizer createEvent error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo sự kiện' });
      }
    }
  ],

  getOrders: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;
      const statusFilter = req.query.status || 'all';

      // 1. Lấy danh sách ID các sự kiện thuộc về Organizer này
      const myEventIds = await Event.find({ organizerId: req.user.id }).distinct('_id');

      // 2. Xây dựng Query lọc đơn hàng
      const query = { eventId: { $in: myEventIds } };
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      // 3. Thực hiện truy vấn (Lưu ý: Populate userId để lấy tên khách hàng)
      const [orders, total, statsData] = await Promise.all([
        Order.find(query)
          .populate('userId', 'name avatar')
          .populate('eventId', 'title')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Order.countDocuments(query),
        // Tính toán thống kê nhanh
        Order.aggregate([
          { $match: { eventId: { $in: myEventIds } } },
          { $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              paidOrders: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
              pendingOrders: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
              totalRevenue: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0] } }
          }}
        ])
      ]);

      const stats = statsData[0] || { totalOrders: 0, paidOrders: 0, pendingOrders: 0, totalRevenue: 0 };

      // 4. Render với đầy đủ biến để tránh lỗi Pug
      res.render('organizer/dashboard/order/index', {
        pageTitle: 'Quản lý đơn hàng',
        orders,
        stats, 
        statusFilter,
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      });
    } catch (err) {
      console.error(err);
      res.status(500).render('clients/page/error/500');
    }
  },

  getSalesHistory: async (req, res) => {
  try {
    // 1. Lấy danh sách ID các sự kiện của Organizer này
    const myEvents = await Event.find({ organizerId: req.user.id }).distinct('_id');

    // 2. Tìm tất cả đơn hàng khách đã mua của các sự kiện đó
    const orders = await Order.find({ eventId: { $in: myEvents } })
      .populate('userId', 'name email')
      .populate('eventId', 'title')
      .sort({ createdAt: -1 });

    // 3. Tính toán stats để không bị lỗi Pug
    const stats = {
      totalOrders: orders.length,
      paidOrders: orders.filter(o => o.status === 'paid').length,
      // ... các thông số khác
    };

    res.render('organizer/dashboard/order/index', {
      pageTitle: 'Lịch sử bán hàng',
      orders,
      stats 
    });
  } catch (error) {
    res.status(500).send("Lỗi truy xuất dữ liệu bán hàng");
  }
}

 
};

export default OrganizerOrderController;
