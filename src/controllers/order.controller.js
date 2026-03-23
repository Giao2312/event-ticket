import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Ticket from '../models/ticket.models.js';
import QRCode from 'qrcode';
import logger from '../utils/logger.js';

const attachTicketTypeInfo = (order) => {
  if (!order || !order.eventId || !Array.isArray(order.items)) return order;
  const ticketTypes = order.eventId.ticketTypes || [];
  const findTicketType = (id) => ticketTypes.find(t => t._id?.toString() === id?.toString());

  order.items = order.items.map(item => {
    const tt = findTicketType(item.ticketTypeId);
    return {
      ...item,
      ticketTypeId: tt ? { _id: tt._id, type: tt.type, price: tt.price } : item.ticketTypeId
    };
  });

  return order;
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
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để đặt vé'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const session = await mongoose.startSession();
      const MAX_RETRIES = 3;
      let lastError = null;

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            let createdOrderId = null;

            await session.withTransaction(async () => {
              const userId = req.user.id;
              const { items } = req.body;

              let totalAmount = 0;
              const orderItems = [];
              let eventId = null;

              for (const item of items) {
                // 1. Tìm event chứa ticketType và kiểm tra tồn kho
                const event = await Event.findOne({ 'ticketTypes._id': item.ticketTypeId }).session(session);
                if (!event) {
                  throw new Error(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
                }

                const ticketType = event.ticketTypes.id(item.ticketTypeId);
                if (!ticketType) {
                  throw new Error(`Vé không tồn tại cho ID: ${item.ticketTypeId}`);
                }

                const holded = ticketType.holded || 0;
                const available = ticketType.quantity - ticketType.sold - holded;
                if (available < item.quantity) {
                  throw new Error(`Không đủ số lượng vé cho loại: ${ticketType.type}`);
                }

                // 2. Gán eventId (chỉ gán 1 lần) và đảm bảo cùng 1 sự kiện
                if (!eventId) eventId = event._id;
                if (eventId.toString() !== event._id.toString()) {
                  throw new Error('Tất cả vé trong một đơn hàng phải thuộc cùng một sự kiện');
                }

                // 3. Giữ vé (hold) trên sub-document
                ticketType.holded = holded + item.quantity;
                await event.save({ session });

                totalAmount += ticketType.price * item.quantity;
                orderItems.push({
                  ticketTypeId: ticketType._id,
                  quantity: item.quantity,
                  price: ticketType.price
                });
              }

              // 4. Kiểm tra kỹ trước khi tạo Order
              if (!eventId) throw new Error('Không thể xác định sự kiện từ danh sách vé');

              const order = new Order({
                userId,
                eventId,
                items: orderItems,
                totalAmount,
                paymentMethod: 'momo',
                holdUntil: new Date(Date.now() + 15 * 60 * 1000)
              });

              await order.save({ session });
              createdOrderId = order._id;
            });

            return res.status(201).json({ success: true, orderId: createdOrderId });
          } catch (err) {
            lastError = err;
            const isTransient =
              err?.errorLabels?.includes('TransientTransactionError') ||
              err?.errorLabels?.includes('UnknownTransactionCommitResult') ||
              err?.codeName === 'WriteConflict' ||
              err?.code === 112;

            if (!isTransient || attempt === MAX_RETRIES) {
              throw err;
            }
          }
        }
      } catch (err) {
        logger.error('Lỗi tạo đơn hàng:', err);
        res.status(400).json({ success: false, message: lastError?.message || err.message });
      } finally {
        await session.endSession();
      }
    }
  ],

  payOrder: async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        const order = await Order.findById(req.params.id).session(session);
        if (!order || order.status !== 'PENDING') {
          throw new Error('Đơn hàng không hợp lệ hoặc đã thanh toán');
        }

        const ticketsToCreate = [];
        const event = await Event.findById(order.eventId).session(session);
        if (!event) {
          throw new Error('Không tìm thấy sự kiện cho đơn hàng');
        }

        for (const item of order.items) {
          const ticketType = event.ticketTypes.id(item.ticketTypeId);
          if (!ticketType) {
            throw new Error(`Không tìm thấy loại vé: ${item.ticketTypeId}`);
          }

          const holded = ticketType.holded || 0;
          ticketType.holded = Math.max(0, holded - item.quantity);
          ticketType.sold = Math.min(ticketType.quantity, (ticketType.sold || 0) + item.quantity);

          for (let i = 0; i < item.quantity; i++) {
            const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
            ticketsToCreate.push({
              user: order.userId,
              event: order.eventId,
              ticketType: ticketType.type || String(item.ticketTypeId),
              quantity: 1,
              price: item.price,
              status: 'paid',
              qrCode: await QRCode.toDataURL(qrData),
            });
          }
        }

        const createdTickets = await Ticket.insertMany(ticketsToCreate, { session });
        await event.save({ session });
        
        order.status = 'PAID';
        order.paidAt = new Date();
        order.tickets = createdTickets.map(t => t._id);
        
        await order.save({ session });
      });

      res.json({ success: true, message: 'Thanh toán thành công' });
    } catch (err) {
      logger.error('Lỗi thanh toán:', err);
      res.status(400).json({ success: false, message: err.message });
    } finally {
      session.endSession();
    }
  },

  paypalCreate: async (req, res) => {
    return res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    });
  },

  paypalCapture: async (req, res) => {
    return res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    });
  },

  checkOrderStatus: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).select('status');
      res.json({ success: true, status: order ? order.status : 'NOT_FOUND' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
  },
  
  getOrderHistory: async (req, res) => {
    try {
      const userId = req.user._id;

      const orders = await Order.find({ userId })
        .populate("eventId", "title")
        .sort({ createdAt: -1 })
        .lean();

      const transactions = orders.map(order => ({
        id: order._id,
        eventName: order.eventId?.title || "Sự kiện không tồn tại",
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        method: order.paymentMethod
      }));

      res.render("clients/page/profile/index", {
        pageTitle: "Quản lý tài khoản",
        user: req.user,
        transactions,
        activeTab: "transactions"
      });

    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi tải lịch sử đơn hàng");
    }
  },

  getMyOrders: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const orders = await Order.find({ userId: req.user.id })
        .populate('eventId', 'name date ticketTypes')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Order.countDocuments({ userId: req.user.id });

      const mappedOrders = orders.map(order => attachTicketTypeInfo(order));

      res.render('clients/page/my-tickets/index', {
        pageTitle: 'Đơn hàng của tôi',
        orders: mappedOrders,
        pagination: { page, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('clients/page/error/500');
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
        userId: userId,
        status: 'PENDING' 
      })
      .populate('eventId', 'name date venue location image ticketTypes'); 

      if (!order || !order.eventId) {
        return res.status(404).render('clients/page/error/404', {
          message: 'Đơn hàng hoặc sự kiện không tồn tại.'
        });
      }

      const now = new Date();
      const timeLeft = Math.max(0, Math.floor((order.holdUntil - now) / 1000));

      if (timeLeft === 0) {
        order.status = 'EXPIRED';
        await order.save();
        return res.status(404).render('clients/page/error/404', {
          message: 'Thời gian giữ vé đã hết. Vui lòng đặt lại vé!'
        });
      }
      
      const orderObj = attachTicketTypeInfo(order.toObject());

      res.render('clients/page/order/checkout', {
        pageTitle: 'Thanh toán đơn hàng',
        order: orderObj,
        timeLeft, 
        layout: 'clients/layout/default'
      });
    } catch (err) {
      console.error('Lỗi render checkout:', err);
      res.status(500).render('clients/page/error/500');
    }
  },

  cancelOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findById(req.params.id).session(session);

      if (!order) throw new Error('Không tìm thấy đơn hàng');
      if (order.status !== 'PENDING') throw new Error('Chỉ có thể hủy đơn hàng đang chờ thanh toán');

      const event = await Event.findById(order.eventId).session(session);
      if (!event) throw new Error('Không tìm thấy sự kiện của đơn hàng');

      for (const item of order.items) {
        const ticketType = event.ticketTypes.id(item.ticketTypeId);
        if (ticketType) {
          const holded = ticketType.holded || 0;
          ticketType.holded = Math.max(0, holded - item.quantity);
        }
      }

      await event.save({ session });

      order.status = 'CANCELLED';
      await order.save({ session });

      await session.commitTransaction();
      res.json({ success: true, message: 'Hủy đơn hàng thành công' });
    } catch (err) {
      await session.abortTransaction();
      logger.error('Lỗi hủy đơn:', err);
      res.status(400).json({ success: false, message: err.message });
    } finally {
      session.endSession();
    }
  },

  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        .populate('userId', 'name email')
        .populate('eventId', 'name ticketTypes')
        .sort({ createdAt: -1 })
        .lean();

      const mappedOrders = orders.map(order => attachTicketTypeInfo(order));

      res.render('admin/orders/index', {
        pageTitle: 'Quản lý đơn hàng',
        orders: mappedOrders
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('admin/page/error/500');
    }
  },
}

export default OrderController;
