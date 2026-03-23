// routes/admin.router.js (hoặc dashboard.router.js)
import express from "express";
import AdminController from "../../controllers/admin.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";

const router = express.Router();

// Admin dashboard chính
router.get(
  "/admin",
  authMiddleware,
  roleMiddleware("admin"),
  AdminController.getDashboard
);

// Danh sách sự kiện (view)
router.get(
  "/admin/dashboard/events",
  authMiddleware,
  roleMiddleware("admin"),
  AdminController.manageEvents,
  (req, res) => {
    res.render("admin/dashboard/events", { pageTitle: "Admin Quản lý sự kiện" });
  }
);


router.get(
  "/admin/dashboard",
  authMiddleware,
  roleMiddleware("admin"),
  AdminController.getDashboard 
);

// Quản lý đơn hàng (admin)
router.get(
  "/admin/dashboard/orders",
  authMiddleware,
  roleMiddleware("admin"),
  AdminController.manageOrders
);

export default router;
