
import express from "express";
import OrderController from "./../../controllers/order.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post('/create', authMiddleware, OrderController.createOrder);
router.put('/:id/pay', authMiddleware, OrderController.payOrder);
router.delete('/:id/cancel', authMiddleware, OrderController.cancelOrder);
router.get('/my-orders', authMiddleware, OrderController.getMyOrders);
router.get('/all', authMiddleware, OrderController.getAllOrders);

export default router;
