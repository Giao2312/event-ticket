import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Order from '../models/order.models.js';
import TicketType from '../models/ticketType.models.js';
import Ticket from '../models/ticket.models.js';
import QRCode from 'qrcode';
import logger from '../utils/logger.js';

const OrderController = {
  createOrder: [
    body('items').isArray({ min: 1 }).withMessage('Items phải là array ít nhất 1'),
    body('items.*.ticketTypeId').isMongoId().withMessage('Invalid ticketTypeId'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity >=1'),
    body('paymentMethod').isIn(['COD', 'VNPay', 'MoMo']).withMessage('Invalid payment method'),

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

        for (const item of items) {
          const ticketType = await TicketType.findById(item.ticketTypeId).session(session);
          if (!ticketType) throw new Error(`Loại vé ${item.ticketTypeId} không tồn tại`);

          if (item.quantity > ticketType.available) {
            throw new Error(`Vé "${ticketType.type}" chỉ còn ${ticketType.available} vé`);
          }

          totalAmount += ticketType.price * item.quantity;
          orderItems.push({
            ticketTypeId: ticketType._id,
            quantity: item.quantity,
            price: ticketType.price
          });

          // Hold vé (tăng holded, giảm available)
          ticketType.available -= item.quantity;
          ticketType.holded = (ticketType.holded || 0) + item.quantity;
          await ticketType.save({ session });
        }

        const order = new Order({
          userId,
          items: orderItems,
          totalAmount,
          paymentMethod,
          holdUntil: new Date(Date.now() + 10 * 60 * 1000) // 10 phút
        });

        await order.save({ session });

        await session.commitTransaction();

        res.status(201).json({
          success: true,
          message: 'Tạo đơn hàng thành công',
          orderId: order._id,
          totalAmount,
          holdUntil: order.holdUntil
        });
      } catch (err) {
        await session.abortTransaction();
        logger.error('Lỗi tạo đơn hàng:', err);
        res.status(400).json({ success: false, message: err.message });
      } finally {
        session.endSession();
      }
    },
  ],

  payOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const orderId = req.params.id;
      const order = await Order.findById(orderId).session(session);

      if (!order) throw new Error('Không tìm thấy đơn hàng');
      if (order.status !== 'PENDING') throw new Error('Đơn hàng không hợp lệ để thanh toán');

      order.status = 'PAID';
      order.paidAt = new Date();
      await order.save({ session });

    
      for (const item of order.items) {
        for (let i = 0; i < item.quantity; i++) {
          const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${i}`;
          const qrCode = await QRCode.toDataURL(qrData);

          const ticket = new Ticket({
            orderId: order._id,
            ticketTypeId: item.ticketTypeId,
            userId: order.userId,
            qrCode,
            code: qrData 
          });

          await ticket.save({ session });
          order.tickets.push(ticket._id);
        }
      }

      await order.save({ session });

      await session.commitTransaction();

      res.json({ success: true, message: 'Thanh toán thành công', orderId: order._id });
    } catch (err) {
      await session.abortTransaction();
      logger.error('Lỗi thanh toán:', err);
      res.status(400).json({ success: false, message: err.message });
    } finally {
      session.endSession();
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

      res.render('client/pages/user/orders', {
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
      res.status(500).render('admin/pages/error/500');
    }
  }
};

export default OrderController;