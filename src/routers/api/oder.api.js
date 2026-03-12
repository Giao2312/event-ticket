import express from "express";
import OrderController from "../../controllers/order.controller.js";
import authMiddleware from "../../middlewares/auth.middleware.js";

const router = express.Router(); 

// Bỏ tiền tố /api đi, vì server.js đã quản lý nó rồi
router.post('/create', authMiddleware, OrderController.createOrder);
router.put('/:id/pay', authMiddleware, OrderController.payOrder);
router.delete('/:id/cancel', authMiddleware, OrderController.cancelOrder);
router.get('/my-orders', authMiddleware, OrderController.getMyOrders); 
router.get('/:id/status', authMiddleware, OrderController.checkOrderStatus); 

export default router;
