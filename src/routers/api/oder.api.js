import express from "express";
import OrderController from "../../controllers/order.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post('/create', authMiddleware, OrderController.createOrder);
router.post('/:id/abandon', authMiddleware, OrderController.abandonCheckout);
router.delete('/:id/cancel', authMiddleware, OrderController.cancelOrder);
router.get('/my-orders', authMiddleware, OrderController.getMyOrders);
router.get('/:id/status', authMiddleware, OrderController.checkOrderStatus);

export default router;
