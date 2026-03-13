import express from 'express';
import PaymentController from '../../controllers/payment.controller.js';
import {isAdmin , verifyToken}  from '../../middlewares/auth.middleware.js';
 
const router = express.Router();

/**
 * @route   POST /api/payment/create
 * @desc    Khởi tạo thanh toán (MoMo hoặc PayPal)
 * @access  Private (Người dùng đã đăng nhập)
 */
router.post('/create',  PaymentController.createPayment);

/**
 * @route   GET /api/payment/momo-return
 * @desc    Nhận kết quả trả về từ MoMo sau khi khách thanh toán
 * @access  Public (Cổng thanh toán gọi về)
 */
router.get('/momo-return', PaymentController.momoReturn);

/**
 * @route   GET /api/payment/paypal-return
 * @desc    Nhận kết quả trả về từ PayPal sau khi khách thanh toán
 * @access  Public (Cổng thanh toán gọi về)
 */
router.get('/paypal-return', PaymentController.paypalReturn);

/**
 * @route   POST /api/payment/admin/retry/:orderId
 * @desc    Admin xử lý lại các đơn hàng bị lỗi PROCESSING_ERROR
 * @access  Private (Chỉ dành cho Admin)
 */
router.post(
    '/admin/retry/:orderId', 
    verifyToken, 
    isAdmin, 
    PaymentController.retryPayment
);

export default router;
