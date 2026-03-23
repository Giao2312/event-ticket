import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import OrganizerOrderController from "../../controllers/Organizer.controller.js";
import OrderController from "../../controllers/order.controller.js";

const router = express.Router();

// API / views cho organizer
router.get(
  "/organizer/orders",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getOrders
);

router.get(
  "/organizer/dashboard",
  authMiddleware,
  roleMiddleware("Organizer"),
  (req, res) => {
    res.render("organizer/dashboard/events/index", { pageTitle: "Bảng điều khiển" });
  }
);

router.get(
  "/organizer/events",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getEventsPage
);

router.get(
  "/organizer/create-event",
  authMiddleware,
  roleMiddleware("Organizer"),
  (req, res) => {
    res.render("organizer/dashboard/events/create", { pageTitle: "Tạo sự kiện" });
  }
);

router.post(
  "/organizer/create-event",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.createEvent
);

// Lịch sử đơn hàng cá nhân (người mua hoặc organizer xem)
router.get(
  "/my-orders",
  authMiddleware,
  OrderController.getOrderHistory
);

router.post("/checkout", authMiddleware, OrderController.createOrder);

export default router;
