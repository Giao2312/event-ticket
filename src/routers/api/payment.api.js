import express from 'express';
import PaymentController from '../../controllers/payment.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.post('/create', authMiddleware, PaymentController.createPayment);

router.get('/momo-return', PaymentController.momoReturn);

router.get('/paypal-return', (req, res) =>
  res.status(503).json({
    success: false,
    message: 'Ban demo dang tam dung PayPal, vui long dung MoMo'
  })
);

export default router;
