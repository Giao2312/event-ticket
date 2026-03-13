import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Order from '../models/order.models.js';
import TicketType from '../models/ticketType.models.js';
import Ticket from '../models/ticket.models.js';
import paypalService from '../services/paypal.services.js';
import QRCode from 'qrcode';
import logger from '../utils/logger.js';

const OrderController = {
  createOrder: [
    body('items').isArray({ min: 1 }).withMessage('Items phải là array ít nhất 1'),
    body('items.*.ticketTypeId').isMongoId().withMessage('Invalid ticketTypeId'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity >=1'),
    body('paymentMethod').isIn(['COD', 'VNPay', 'MoMo', 'PayPal']).withMessage('Invalid payment method'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const userId = req.user.id;
        const { items, paymentMethod } = req.body;

        let totalAmount = 0;
        const orderItems = [];
        let eventId = null;

        for (const item of items) {
          // 1. Update nguyên tử: Trừ vé và check điều kiện trong 1 bước
          const ticketType = await TicketType.findOneAndUpdate(
            { 
              _id: item.ticketTypeId,
              // Kiểm tra xem số vé còn lại có đủ đáp ứng không
              $expr: { $gte: [{ $subtract: ["$quantity", { $add: ["$sold", "$holded"] }] }, item.quantity] }
            },
            { $inc: { holded: item.quantity } }, 
            { session, new: true }
          );

          if (!ticketType) {
            throw new Error(`Vé không tồn tại hoặc không đủ số lượng cho ID: ${item.ticketTypeId}`);
          }

          // 2. Gán eventId từ ticketType (chỉ gán 1 lần)
          if (!eventId) eventId = ticketType.eventId;

          totalAmount += ticketType.price * item.quantity;
          orderItems.push({
            ticketTypeId: ticketType._id,
            quantity: item.quantity,
            price: ticketType.price
          });
        }

        // 3. Kiểm tra kỹ trước khi tạo Order
        if (!eventId) throw new Error('Không thể xác định sự kiện từ danh sách vé');

        const order = new Order({
          userId,
          eventId, // Đã được đảm bảo không null ở bước trên
          items: orderItems,
          totalAmount,
          paymentMethod,
          holdUntil: new Date(Date.now() + 15 * 60 * 1000)
        });

        await order.save({ session });
        await session.commitTransaction();

        res.status(201).json({ success: true, orderId: order._id });

      } catch (err) {
        await session.abortTransaction();
        logger.error('Lỗi tạo đơn hàng:', err);
        res.status(400).json({ success: false, message: err.message });
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

        // Tối ưu: Tạo mảng tickets trước khi lưu
        const ticketsToCreate = [];
        for (const item of order.items) {
          for (let i = 0; i < item.quantity; i++) {
            const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
            ticketsToCreate.push({
              orderId: order._id,
              ticketTypeId: item.ticketTypeId,
              userId: order.userId,
              qrCode: await QRCode.toDataURL(qrData),
              code: qrData
            });
          }
        }

        // Dùng insertMany để tiết kiệm thời gian ghi vào DB
        const createdTickets = await Ticket.insertMany(ticketsToCreate, { session });
        
        // Cập nhật đơn hàng
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

  checkOrderStatus: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id).select('status');
      res.json({ success: true, status: order ? order.status : 'NOT_FOUND' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },


  cancelOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await Order.findById(req.params.id).session(session);

      if (!order) throw new Error('Không tìm thấy đơn hàng');
      if (order.status !== 'PENDING') throw new Error('Chỉ có thể hủy đơn hàng đang chờ thanh toán');


      for (const item of order.items) {
        const ticketType = await TicketType.findById(item.ticketTypeId).session(session);
        ticketType.available += item.quantity;
        ticketType.holded -= item.quantity;
        await ticketType.save({ session });
      }

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

  getMyOrders: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const orders = await Order.find({ userId: req.user.id })
        .populate('eventId', 'name date')
        .populate('items.ticketTypeId', 'type price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Order.countDocuments({ userId: req.user.id });

      res.render('clients/page/user/orders', {
        pageTitle: 'Đơn hàng của tôi',
        orders,
        pagination: { page, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('clients/page/error/500');
    }
  },

  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        .populate('userId', 'name email')
        .populate('eventId', 'name')
        .populate('items.ticketTypeId', 'type price')
        .sort({ createdAt: -1 });

      res.render('admin/orders/index', {
        pageTitle: 'Quản lý đơn hàng',
        orders
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('admin/page/error/500');
    }
  },

  renderCheckoutPage: async (req, res) => {
 
    try {
         if (!req.user) {
        return res.redirect('/login'); // Hoặc trả về trang thông báo yêu cầu đăng nhập
      }
      const { orderId } = req.params;
      const userId = req.user.id;
      
      const order = await Order.findOne({ 
        _id: orderId, 
        userId: userId,
        status: 'PENDING' 
      })
      .populate('eventId', 'name date venue location image') 
      .populate('items.ticketTypeId', 'type price'); 

      if (!order || !order.eventId) { // Kiểm tra order và cả eventId
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
      
      res.render('clients/page/order/checkout', {
        pageTitle: 'Thanh toán đơn hàng',
        order, // Trong view, bạn dùng order.eventId để lấy thông tin sự kiện
        timeLeft, 
        layout: 'clients/layout/default'
      });
    } catch (err) {
      console.error('Lỗi render checkout:', err);
      res.status(500).render('clients/page/error/500');
    }
  },


  paypalCreate: async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'PENDING') throw new Error('Đơn hàng không hợp lệ');

    const paypalOrder = await paypalService.createOrder(order.totalAmount);
    res.json({ success: true, paymentUrl: paypalOrder.links[1].href }); 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
},

  paypalCapture: async (req, res) => {
    try {
      const { token } = req.query; 
      const captureData = await paypalService.capturePayment(token);
      
      if (captureData.status === 'COMPLETED') {
          await Order.findByIdAndUpdate(req.params.id, { status: 'PAID' });
          res.redirect('/orders/success');
      }
    } catch (err) {
      res.redirect('/orders/fail');
    }
  }
  };


export default OrderController;
