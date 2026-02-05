// routes/order.routes.js
import express from "express";
import OrderController from "./../../controllers/clients/order.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/", authMiddleware, OrderController.createOrder);
router.post("/:id/pay", authMiddleware, OrderController.payOrder);
router.post("/:id/cancel", authMiddleware, OrderController.cancelOrder);
router.get("/my-orders", authMiddleware, OrderController.getMyOrders);

export default router;
