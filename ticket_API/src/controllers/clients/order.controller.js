// controllers/order.controller.js
import Order from "../../models/order.models.js";
import TicketType from "../../models/ticketType.models.js";
import Ticket from "../../models/ticket.models.js";
import crypto from "node:crypto";

const OrderController = {

  // 1️⃣ Tạo đơn hàng
  createOrder: async (req, res) => {
    try {
      const userId = req.user.id;
      const { eventId, items, paymentMethod } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Chưa chọn vé" });
      }

      let totalAmount = 0;
      const orderItems = [];

      // Kiểm tra từng loại vé
      for (const item of items) {
        const ticketType = await TicketType.findById(item.ticketTypeId);

        if (!ticketType) {
          return res.status(404).json({ message: "Loại vé không tồn tại" });
        }

        if (ticketType.sold + item.quantity > ticketType.quantity) {
          return res.status(400).json({
            message: `Vé "${ticketType.title}" đã hết`
          });
        }

        totalAmount += ticketType.price * item.quantity;

        orderItems.push({
          ticketTypeId: ticketType._id,
          quantity: item.quantity,
          price: ticketType.price
        });
      }

      const order = await Order.create({
        userId,
        eventId,
        items: orderItems,
        totalAmount,
        paymentMethod
      });

      return res.status(201).json({
        message: "Tạo đơn hàng thành công",
        order
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Lỗi tạo đơn hàng" });
    }
  },

  // 2️⃣ Thanh toán (giả lập)
  payOrder: async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (order.status !== "PENDING") {
        return res.status(400).json({ message: "Đơn hàng không hợp lệ" });
      }

      // Cập nhật trạng thái
      order.status = "PAID";
      order.paidAt = new Date();
      await order.save();

      // Cập nhật vé & sinh ticket
      for (const item of order.items) {
        const ticketType = await TicketType.findById(item.ticketTypeId);

        ticketType.sold += item.quantity;
        await ticketType.save();

        // Sinh ticket
        for (let i = 0; i < item.quantity; i++) {
          await Ticket.create({
            orderId: order._id,
            ticketTypeId: ticketType._id,
            UserId: order.userId,
            qrCode: crypto.randomBytes(16).toString("hex")
          });
        }
      }

      res.json({ message: "Thanh toán thành công" });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Lỗi thanh toán" });
    }
  },

  // 3️⃣ Hủy đơn
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

  // 4️⃣ Lịch sử đơn hàng của user
  getMyOrders: async (req, res) => {
    try {
      const orders = await Order.find({ userId: req.user.id })
        .populate("eventId", "title date")
        .sort({ createdAt: -1 });

      res.render("client/pages/user/orders", {
        pageTitle: "Đơn hàng của tôi",
        orders
      });

    } catch (err) {
      res.status(500).send("Lỗi server");
    }
  },

  // 5️⃣ Admin – xem tất cả đơn
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
      res.status(500).send("Lỗi server");
    }
  }
};

export default OrderController;
