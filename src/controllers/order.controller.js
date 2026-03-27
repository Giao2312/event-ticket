import { body, validationResult } from 'express-validator';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { createPendingOrder, finalizePaidOrder, releasePendingOrder } from '../services/checkout.service.js';

const attachTicketTypeInfo = (order) => {
  if (!order || !order.eventId || !Array.isArray(order.items)) return order;
  const ticketTypes = order.eventId.ticketTypes || [];
  const findTicketType = (id) => ticketTypes.find((ticketType) => ticketType._id?.toString() === id?.toString());

  order.items = order.items.map((item) => {
    const ticketType = findTicketType(item.ticketTypeId);
    return {
      ...item,
      ticketTypeId: ticketType
        ? { _id: ticketType._id, type: ticketType.type, price: ticketType.price }
        : item.ticketTypeId
    };
  });

  return order;
};

const hasCompleteBookingProfile = (user) => {
  if (!user) return false;
  const hasName = typeof user.name === 'string' && user.name.trim().length >= 2;
  const hasPhone = typeof user.phone === 'string' && user.phone.replace(/\D/g, '').length >= 10;
  const hasAddress = typeof user.address === 'string' && user.address.trim().length >= 10;
  return hasName && hasPhone && hasAddress;
};

const buildSafeRedirectPath = (req) => {
  const fallbackPath = '/events';
  const referer = req.get('referer');

  if (!referer) return fallbackPath;

  try {
    const url = new URL(referer);
    return `${url.pathname || ''}${url.search || ''}` || fallbackPath;
  } catch (err) {
    return fallbackPath;
  }
};

const OrderController = {
  createOrder: [
    body('items').isArray({ min: 1 }).withMessage('Danh sách vé phải là mảng và có ít nhất 1 mục'),
    body('items.*.ticketTypeId').isMongoId().withMessage('ID loại vé không hợp lệ'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Số lượng phải lớn hơn hoặc bằng 1'),
    body('paymentMethod').custom((value) => {
      const normalized = (value || '').toString().toLowerCase();
      if (normalized !== 'momo') {
        throw new Error('Bản demo hiện chỉ hỗ trợ thanh toán MoMo');
      }
      return true;
    }),

    async (req, res) => {
      if (!req.user || (!req.user._id && !req.user.id)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để đặt vé'
        });
      }

      if (!hasCompleteBookingProfile(req.user)) {
        const bookingData = encodeURIComponent(JSON.stringify(req.body));
        const redirectPath = encodeURIComponent(buildSafeRedirectPath(req));
        return res.status(403).json({
          success: false,
          message: 'Vui lòng cập nhật thông tin trước khi đặt vé',
          redirectUrl: `/verify-profile?redirect=${redirectPath}&booking=${bookingData}`
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      try {
        const createdOrderId = await createPendingOrder({
          userId: req.user.id,
          items: req.body.items,
          paymentMethod: 'momo'
        });

        return res.status(201).json({ success: true, orderId: createdOrderId });
      } catch (err) {
        logger.error('Lỗi tạo đơn hàng:', err);
        return res.status(err.status || 400).json({
          success: false,
          message: err.message
        });
      }
    }
  ],

  payOrder: async (req, res) => {
    try {
      await finalizePaidOrder({ orderId: req.params.id, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
      return res.json({ success: true, message: 'Thanh toán thành công' });
    } catch (err) {
      logger.error('Lỗi thanh toán:', err);
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  },

  paypalCreate: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  paypalCapture: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  checkOrderStatus: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).select('status');
      return res.json({ success: true, status: order ? order.status : 'NOT_FOUND' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
  },

  getOrderHistory: async (req, res) => {
    try {
      const userId = req.user._id;
      const orders = await Order.find({ userId }).populate('eventId', 'title').sort({ createdAt: -1 }).lean();

      const transactions = orders.map((order) => ({
        id: order._id,
        eventName: order.eventId?.title || 'Sự kiện không tồn tại',
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        method: order.paymentMethod
      }));

      return res.render('clients/page/profile/index', {
        pageTitle: 'Quản lý tài khoản',
        user: req.user,
        transactions,
        activeTab: 'transactions'
      });
    } catch (error) {
      logger.error('Lỗi tải lịch sử đơn hàng:', error);
      return res.status(500).send('Lỗi tải lịch sử đơn hàng');
    }
  },

  getMyOrders: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const orders = await Order.find({ userId: req.user.id })
        .populate('eventId', 'name date ticketTypes')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Order.countDocuments({ userId: req.user.id });
      const mappedOrders = orders.map((order) => attachTicketTypeInfo(order));

      return res.render('clients/page/my-tickets/index', {
        pageTitle: 'Đơn hàng của tôi',
        orders: mappedOrders,
        pagination: { page, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      logger.error(err);
      return res.status(500).render('clients/page/error/500');
    }
  },

  renderCheckoutPage: async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect('/login');
      }

      const { orderId } = req.params;
      const userId = req.user.id;
      const order = await Order.findOne({
        _id: orderId,
        userId,
        status: { $in: ['PENDING', 'PAYMENT_FAILED'] }
      }).populate('eventId', 'name date venue location image ticketTypes');

      if (!order || !order.eventId) {
        return res.status(404).render('clients/page/error/404', {
          message: 'Đơn hàng hoặc sự kiện không tồn tại.'
        });
      }

      const now = new Date();
      const timeLeft = Math.max(0, Math.floor((order.holdUntil - now) / 1000));

      if (timeLeft === 0) {
        await releasePendingOrder({ orderId: order._id, userId, markAs: 'EXPIRED' }).catch(() => null);
        return res.status(404).render('clients/page/error/404', {
          message: 'Thời gian giữ vé đã hết. Vui lòng đặt lại vé!'
        });
      }

      const orderObj = attachTicketTypeInfo(order.toObject());

      return res.render('clients/page/order/checkout', {
        pageTitle: 'Thanh toán đơn hàng',
        order: orderObj,
        timeLeft,
        layout: 'clients/layout/default'
      });
    } catch (err) {
      logger.error('Lỗi render checkout:', err);
      return res.status(500).render('clients/page/error/500');
    }
  },

  cancelOrder: async (req, res) => {
    try {
      await releasePendingOrder({ orderId: req.params.id, userId: req.user.id, markAs: 'CANCELLED' });
      return res.json({ success: true, message: 'Hủy đơn hàng thành công' });
    } catch (err) {
      logger.error('Lỗi hủy đơn:', err);
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  },

  abandonCheckout: async (req, res) => {
    try {
      await releasePendingOrder({ orderId: req.params.id, userId: req.user.id, markAs: 'CANCELLED' });
      return res.json({
        success: true,
        message: 'Đã rời trang thanh toán, vé đã được trả lại kho'
      });
    } catch (err) {
      if (err.message === 'Chỉ có thể hủy đơn hàng đang chờ thanh toán') {
        return res.status(200).json({
          success: true,
          message: 'Đơn hàng không còn ở trạng thái giữ vé'
        });
      }

      logger.error('Lỗi hủy giữ vé khi rời checkout:', err);
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  },

  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        .populate('userId', 'name email')
        .populate('eventId', 'name ticketTypes')
        .sort({ createdAt: -1 })
        .lean();

      const mappedOrders = orders.map((order) => attachTicketTypeInfo(order));

      return res.render('admin/orders/index', {
        pageTitle: 'Quản lý đơn hàng',
        orders: mappedOrders
      });
    } catch (err) {
      logger.error(err);
      return res.status(500).render('admin/page/error/500');
    }
  }
};

export default OrderController;
