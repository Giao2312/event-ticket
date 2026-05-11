import { body, validationResult } from 'express-validator';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { createPendingOrder, finalizePaidOrder, releasePendingOrder } from '../services/checkout.service.js';

// Gan thong tin loai ve vao cac muc trong don hang de hien thi
const attachTicketTypeInfo = (order) => {
  // Kiem tra don hang co eventId va items
  if (!order?.eventId || !Array.isArray(order.items)) return order;
  const ticketTypes = order.eventId.ticketTypes || [];
  // Tim loai ve theo id
  const findTicketType = (id) => ticketTypes.find((ticketType) => ticketType._id?.toString() === id?.toString());

  // Gan thong tin loai ve (type, price) vao tung muc trong don hang
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

// Kiem tra nguoi dung da dien day thong tin ho so dat ve chua
const hasCompleteBookingProfile = (user) => {
  if (!user) return false;
  // Kiem tra ten (it nhat 2 ky tu)
  const hasName = typeof user.name === 'string' && user.name.trim().length >= 2;
  // Kiem tra so dien thoai (it nhat 10 so)
  const hasPhone = typeof user.phone === 'string' && user.phone.replaceAll(/\D/g, '').length >= 10;
  // Kiem tra dia chi (it nhat 10 ky tu)
  const hasAddress = typeof user.address === 'string' && user.address.trim().length >= 10;
  return hasName && hasPhone && hasAddress;
};

// Tao duong dan redirect an toan, tranh loi khi referer khong hop le
const buildSafeRedirectPath = (req) => {
  const fallbackPath = '/events';
  const referer = req.get('referer');

  // Neu khong co referer thi tra ve duong dan mac dinh
  if (!referer) return fallbackPath;

  try {
    // Parse referer de lay pathname
    const url = new URL(referer);
    return `${url.pathname || ''}${url.search || ''}` || fallbackPath;
  } catch (err) {
    return fallbackPath;
  }
};

const OrderController = {
  // Tao don hang moi (truoc khi thanh toan)
  createOrder: [
    // Validation cho du lieu dau vao
    body('items').isArray({ min: 1 }).withMessage('Danh sách vé phải là mảng và có ít nhất 1 mục'),
    body('items.*.ticketTypeId').isMongoId().withMessage('ID loại vé không hợp lệ'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Số lượng phải lớn hơn hoặc bằng 1'),
    body('paymentMethod').custom((value) => {
      // Chi chap nhan thanh toan MoMo trong phien ban demo
      const normalized = (value || '').toString().toLowerCase();
      if (normalized !== 'momo') {
        throw new Error('Bản demo hiện chỉ hỗ trợ thanh toán MoMo');
      }
      return true;
    }),

    async (req, res) => {
      // Kiem tra nguoi dung da dang nhap
      if (!req.user || (!req.user._id && !req.user.id)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để đặt vé'
        });
      }

      // Kiem tra ho so dat ve da day du chua, neu chua thi yeu cau cap nhat
      if (!hasCompleteBookingProfile(req.user)) {
        const bookingData = encodeURIComponent(JSON.stringify(req.body));
        const redirectPath = encodeURIComponent(buildSafeRedirectPath(req));
        return res.status(403).json({
          success: false,
          message: 'Vui lòng cập nhật thông tin trước khi đặt vé',
          redirectUrl: `/verify-profile?redirect=${redirectPath}&booking=${bookingData}`
        });
      }

      // Kiem tra loi validation
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      try {
        // Goi service de tao don hang dang cho thanh toan
        const createdOrderId = await createPendingOrder({
          userId: req.user.id,
          items: req.body.items,
          paymentMethod: 'momo'
        });

        // Tra ve orderId de chuyen huong den trang thanh toan
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

  // Thanh toan don hang (sau khi chon phuong thuc)
  // ============================================================
  // IDOR PROTECTION: Phải kiểm tra order thuộc về user đang đăng nhập
  // Nếu không kiểm tra, attacker có thể thanh toán order của người khác
  // ============================================================
  payOrder: async (req, res) => {
    try {
      if (!req.user || (!req.user._id && !req.user.id)) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
      }

      const userId = req.user.id;
      const orderId = req.params.id;

      // ============================================================
      // BẢO MẬT: Kiểm tra order thuộc về user trước khi thanh toán
      // Nếu orderId đúng nhưng không thuộc user này → từ chối
      // ============================================================
      const order = await Order.findOne({ _id: orderId, userId });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
      }

      // Kiểm tra order ở trạng thái có thể thanh toán
      if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
        return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái chờ thanh toán' });
      }

      // Gọi service để xử lý thanh toán cuối cùng
      await finalizePaidOrder({ orderId, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
      return res.json({ success: true, message: 'Thanh toán thành công' });
    } catch (err) {
      logger.error('Lỗi thanh toán:', err);
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  },

  // PayPal tam dung trong demo
  paypalCreate: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  // PayPal capture tam dung trong demo
  paypalCapture: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  // Kiem tra trang thai don hang
  // ============================================================
  // IDOR PROTECTION: Chỉ cho phép user kiểm tra order của chính mình
  // ============================================================
  checkOrderStatus: async (req, res) => {
    try {
      if (!req.user || (!req.user._id && !req.user.id)) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
      }

      const userId = req.user.id;
      const orderId = req.params.id;

      // ============================================================
      // BẢO MẬT: Chỉ trả về status nếu order thuộc về user
      // ============================================================
      const order = await Order.findOne({ _id: orderId, userId }).select('status');
      return res.json({ success: true, status: order ? order.status : 'NOT_FOUND' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
  },

  // Lay lich su don hang cua nguoi dung
  getOrderHistory: async (req, res) => {
    try {
      const userId = req.user._id;
      // Lay tat ca don hang cua nguoi dung cung thong tin su kien
      const orders = await Order.find({ userId }).populate('eventId', 'title').sort({ createdAt: -1 }).lean();

      // Chuyen doi sang dinh dang giao dich de hien thi
      const transactions = orders.map((order) => ({
        id: order._id,
        eventName: order.eventId?.title || 'Sự kiện không tồn tại',
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        method: order.paymentMethod
      }));

      // Render trang ho so nguoi dung voi tab giao dich
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

  // Lay danh sach don hang cua nguoi dung (trang rieng)
  getMyOrders: async (req, res) => {
    try {
      // Phan trang
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      // Lay don hang cua nguoi dung hien tai
      const orders = await Order.find({ userId: req.user.id })
        .populate('eventId', 'name date ticketTypes')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Dem tong so don hang
      const total = await Order.countDocuments({ userId: req.user.id });
      // Gan thong tin loai ve vao don hang
      const mappedOrders = orders.map((order) => attachTicketTypeInfo(order));

      // Render trang don hang cua toi
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

  // Hien thi trang checkout (thanh toan)
  renderCheckoutPage: async (req, res) => {
    try {
      // Kiem tra nguoi dung da dang nhap
      if (!req.user) {
        return res.redirect('/login');
      }

      const { orderId } = req.params;
      const userId = req.user.id;
      // Lay don hang chi khi no dang o trang thai cho thanh toan
      const order = await Order.findOne({
        _id: orderId,
        userId,
        status: { $in: ['PENDING', 'PAYMENT_FAILED'] }
      }).populate('eventId', 'name date venue location image ticketTypes');

      // Kiem tra don hang ton tai
      if (!order || !order.eventId) {
        return res.status(404).render('clients/page/error/404', {
          message: 'Đơn hàng hoặc sự kiện không tồn tại.'
        });
      }

      // Tinh thoi gian con lai de giu cho (tinh bang giay)
      const now = new Date();
      const timeLeft = Math.max(0, Math.floor((order.holdUntil - now) / 1000));

      // Neu da het gio giu cho, tu dong huy don
      if (timeLeft === 0) {
        await releasePendingOrder({ orderId: order._id, userId, markAs: 'EXPIRED' }).catch(() => null);
        return res.status(404).render('clients/page/error/404', {
          message: 'Thời gian giữ vé đã hết. Vui lòng đặt lại vé!'
        });
      }

      // Gan thong tin loai ve vao don hang
      const orderObj = attachTicketTypeInfo(order.toObject());

      // Render trang checkout
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

  // Huy don hang
  cancelOrder: async (req, res) => {
    try {
      // Goi service de giai phong ve da giu va danh dau huy
      await releasePendingOrder({ orderId: req.params.id, userId: req.user.id, markAs: 'CANCELLED' });
      return res.json({ success: true, message: 'Hủy đơn hàng thành công' });
    } catch (err) {
      logger.error('Lỗi hủy đơn:', err);
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }
  },

  // Xu ly khi nguoi dung roi trang checkout ma chua thanh toan
  abandonCheckout: async (req, res) => {
    try {
      // Tu dong huy don va giai phong ve
      await releasePendingOrder({ orderId: req.params.id, userId: req.user.id, markAs: 'CANCELLED' });
      return res.json({
        success: true,
        message: 'Đã rời trang thanh toán, vé đã được trả lại kho'
      });
    } catch (err) {
      // Neu don hang khong con o trang thai giu ve, van tra ve thanh cong
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

  // Lay tat ca don hang (admin)
  getAllOrders: async (req, res) => {
    try {
      // Lay tat ca don hang cung thong tin nguoi dung va su kien
      const orders = await Order.find()
        .populate('userId', 'name email')
        .populate('eventId', 'name ticketTypes')
        .sort({ createdAt: -1 })
        .lean();

      // Gan thong tin loai ve vao don hang
      const mappedOrders = orders.map((order) => attachTicketTypeInfo(order));

      // Render trang quan ly don hang (admin)
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
