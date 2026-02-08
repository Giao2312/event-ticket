import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Order from '../../models/order.models.js';
import TicketType from '../../models/ticketType.models.js';
import Ticket from '../../models/ticket.models.js';
import logger from '../../utils/logger.js'; 

const OrderController = {

  createOrder: [

    body('items').isArray({ min: 1 }).withMessage('Items phải là array ít nhất 1'),
    body('items.*.ticketTypeId').isMongoId().withMessage('Invalid ticketTypeId'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity >=1'),
    body('paymentMethod').isIn(['COD', 'VNPay', 'MoMo']).withMessage('Invalid payment method'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const userId = req.user.id;
        const { eventId, items, paymentMethod } = req.body;
        let totalAmount = 0;
        const orderItems = [];

        for (const item of items) {
          const ticketType = await TicketType.findById(item.ticketTypeId).session(session);
          if (!ticketType) throw new Error('Loại vé không tồn tại');

          if (item.quantity > ticketType.available) throw new Error(`Vé "${ticketType.title}" hết chỗ`);

          totalAmount += ticketType.price * item.quantity;
          orderItems.push({
            ticketTypeId: ticketType._id,
            quantity: item.quantity,
            price: ticketType.price
          });

          ticketType.sold += item.quantity;
          await ticketType.save({ session });
        }

        const order = new Order({
          userId,
          eventId,
          items: orderItems,
          totalAmount,
          paymentMethod
        });
        await order.save({ session });

        await session.commitTransaction();
        res.status(201).json({ message: 'Tạo đơn hàng thành công', order });
      } catch (err) {
        await session.abortTransaction();
        logger.error(err);
        res.status(400).json({ message: err.message });
      } finally {
        session.endSession();
      }
    }
  ],

  payOrder: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const orderId = req.params.id;
      const order = await Order.findById(orderId).session(session);

      if (!order) throw new Error('Không tìm thấy đơn hàng');
      if (order.status !== 'PENDING') throw new Error('Đơn hàng không hợp lệ');

      order.status = 'PAID';
      order.paidAt = new Date();
      await order.save({ session });
      for (const item of order.items) {
        const ticketType = await TicketType.findById(item.ticketTypeId).session(session);
        ticketType.sold += item.quantity;
        await ticketType.save({ session });
        for (let i = 0; i < item.quantity; i++) {
          const ticket = new Ticket({
            orderId: order._id,
            ticketTypeId: ticketType._id,
            userId: order.userId,
            qrCode: await QRCode.toDataURL(`Ticket:${order._id}-${i}`) // Real QR
          });
          await ticket.save({ session });
          order.tickets.push(ticket._id);
        }
      }
      await order.save({ session });

      await session.commitTransaction();
      res.json({ message: 'Thanh toán thành công' });
    } catch (err) {
      await session.abortTransaction();
      logger.error(err);
      res.status(500).json({ message: 'Lỗi thanh toán' });
    } finally {
      session.endSession();
    }
  },

    cancelOrder: async (req, res) => {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (order.status !== "PENDING") {
        return res.status(400).json({ message: "Không thể hủy đơn này" });
      }

      order.status = "CANCELLED";
      await order.save();

      res.json({ message: "Hủy đơn hàng thành công" });

    } catch (err) {
      res.status(500).json({ message: "Lỗi hủy đơn" }); 
    }
  },


  getMyOrders: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const orders = await Order.find({ userId: req.user.id })
        .populate('eventId', 'title date')
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
      res.status(500).render('client/pages/error/500');
    }
  },


  getAllOrders: async (req, res) => {
    try {
      const orders = await Order.find()
        .populate("userId", "name email")
        .populate("eventId", "title")
        .sort({ createdAt: -1 });

      res.render("admin/orders/index", {
        pageTitle: "Quản lý đơn hàng",
        orders
      });

    } catch (err) {
      logger.error(err);
      res.status(500).render("admin/pages/error/500");
    }
  }

};

export default OrderController;
