import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import OrderController from "../../controllers/order.controller.js";
import Ticket from "../../models/ticket.models.js";

const router = express.Router();

// Trang Vé của tôi (danh sách vé đã mua)
router.get("/", authMiddleware, async (req, res) => {
  if (!req.user) return res.redirect("/login");

  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .populate("event", "name image date time location")
      .sort({ purchasedAt: -1 })
      .lean();

    res.render("clients/page/my-tickets/index", {
      pageTitle: "Vé của tôi - EventVé",
      user: req.user,
      tickets,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("clients/page/error/500", { pageTitle: "Lỗi máy chủ" });
  }
});

// Lịch sử đơn hàng
router.get("/my-orders", authMiddleware, OrderController.getOrderHistory);

// Tạo đơn hàng (checkout)
router.post("/checkout", authMiddleware, OrderController.createOrder);

// Trang chi tiết vé (xem QR + thông tin vé)
router.get("/:ticketId", authMiddleware, async (req, res) => {
  if (!req.user) return res.redirect("/login");

  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, user: req.user._id })
      .populate("event", "name image date time location")
      .lean();

    if (!ticket) {
      return res.status(404).render("clients/page/error/404", {
        pageTitle: "Không tìm thấy vé"
      });
    }

    res.render("clients/page/my-tickets/detail", {
      pageTitle: "Chi tiết vé - EventVé",
      user: req.user,
      ticket
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("clients/page/error/500", { pageTitle: "Lỗi máy chủ" });
  }
});

export default router;
