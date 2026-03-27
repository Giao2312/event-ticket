import crypto from 'node:crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import env from '../config/env.js';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { finalizePaidOrder, isTransientMongoError } from '../services/checkout.service.js';

const buildClientRedirect = (path) => {
  const base = (env.CLIENT_URL || '').trim();
  return base ? `${base}${path}` : path;
};

const findOrderByMomoReference = async (momoRef) => {
  if (!momoRef) return null;

  let order = await Order.findOne({ momoOrderId: momoRef });
  if (order) return order;

  if (typeof momoRef === 'string' && momoRef.length >= 24) {
    const baseOrderId = momoRef.slice(0, 24);
    if (mongoose.Types.ObjectId.isValid(baseOrderId)) {
      order = await Order.findById(baseOrderId);
    }
  }

  return order;
};

// Query MoMo transaction status to verify payment actually succeeded.
// This is the authoritative source — never trust redirect/callback params alone.
const queryMomoTransaction = async (orderId) => {
  try {
    const requestId = `${orderId}-query-${Date.now()}`;
    const rawSignature =
      `accessKey=${env.MOMO_ACCESS_KEY}` +
      `&orderId=${orderId}` +
      `&partnerCode=${env.MOMO_PARTNER_CODE}` +
      `&requestId=${requestId}`;

    const signature = crypto
      .createHmac('sha256', env.MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex');

    const response = await axios.post(env.MOMO_API_URL, {
      partnerCode: env.MOMO_PARTNER_CODE,
      requestId,
      orderId,
      signature,
      lang: 'vi'
    });

    return response.data;
  } catch (err) {
    logger.error('MoMo transaction query error:', err?.response?.data || err.message);
    return null;
  }
};

const PaymentController = {
  createPayment: async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thanh toán' });
      }

      const { orderId, method } = req.body;
      const order = await Order.findById(orderId).populate('eventId');
      if (!order) {
        return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại' });
      }

      if (order.userId?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thanh toán đơn hàng này' });
      }

      const normalizedMethod = (method || '').toString().toLowerCase();
      if (normalizedMethod !== 'momo') {
        return res.status(400).json({
          success: false,
          message: 'Bản demo hiện chỉ hỗ trợ thanh toán MoMo'
        });
      }

      if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng không ở trạng thái chờ thanh toán'
        });
      }

      if (new Date(order.holdUntil) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng đã hết thời gian giữ vé'
        });
      }

      return PaymentController.handleMomoPayment(req, res, order);
    } catch (error) {
      logger.error('Payment Error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },

  handleMomoPayment: async (req, res, order) => {
    const amount = Number.parseInt(order.totalAmount, 10);
    const requestId = `${order._id}-${Date.now()}`;
    const orderIdMomo = `${order._id}-${Date.now()}`;
    const orderInfo = `Thanh toan EventPass: ${order.eventId.name}`;

    const rawSignature =
      `accessKey=${env.MOMO_ACCESS_KEY}` +
      `&amount=${amount}` +
      `&extraData=` +
      `&ipnUrl=${env.MOMO_RETURN_URL}` +
      `&orderId=${orderIdMomo}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${env.MOMO_PARTNER_CODE}` +
      `&redirectUrl=${env.MOMO_RETURN_URL}` +
      `&requestId=${requestId}` +
      `&requestType=captureWallet`;

    const signature = crypto
      .createHmac('sha256', env.MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex');

    const response = await axios.post(env.MOMO_API_URL, {
      partnerCode: env.MOMO_PARTNER_CODE,
      partnerName: 'EventPass',
      storeId: 'MomoTestStore',
      requestId,
      amount,
      orderId: orderIdMomo,
      orderInfo,
      redirectUrl: env.MOMO_RETURN_URL,
      ipnUrl: env.MOMO_RETURN_URL,
      signature,
      requestType: 'captureWallet',
      lang: 'vi',
      extraData: ''
    });

    order.paymentMethod = 'momo';
    order.momoOrderId = orderIdMomo;
    order.paymentError = null;
    await order.save();

    return res.json({ success: true, paymentUrl: response.data.payUrl });
  },

  handlePaypalPayment: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  momoReturn: async (req, res) => {
    const { resultCode, orderId, requestId, signature } = req.query;

    try {
      const normalizedCode = String(resultCode ?? '');
      const momoRef = orderId || requestId;

      // Step 1: Reject failed statuses immediately — no DB writes
      if (normalizedCode !== '0' && normalizedCode !== '9000') {
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      if (!momoRef || !signature) {
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Step 2: Verify MoMo signature to prove this callback is genuine
      const rawSigData =
        `accessKey=${env.MOMO_ACCESS_KEY}` +
        `&amount=${req.query.amount || ''}` +
        `&extraData=${req.query.extraData || ''}` +
        `&message=${req.query.message || ''}` +
        `&orderId=${momoRef}` +
        `&orderInfo=Thanh toan EventPass` +
        `&partnerCode=${env.MOMO_PARTNER_CODE}` +
        `&redirectUrl=${env.MOMO_RETURN_URL}` +
        `&requestId=${requestId || momoRef}` +
        `&responseTime=${req.query.responseTime || ''}` +
        `&transId=${req.query.transId || ''}`;

      const expectedSig = crypto
        .createHmac('sha256', env.MOMO_SECRET_KEY)
        .update(rawSigData)
        .digest('hex');

      if (signature !== expectedSig) {
        logger.warn(`MoMo signature mismatch for momoRef=${momoRef}`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Step 3: Query MoMo transaction status API to confirm payment really succeeded
      // This is the authoritative check — never trust callback params alone
      const transStatus = await queryMomoTransaction(momoRef);
      if (!transStatus || transStatus.resultCode !== '0') {
        logger.warn(`MoMo trans status check failed: ${JSON.stringify(transStatus)}`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Step 4: Find and finalize the order
      const order = await findOrderByMomoReference(momoRef);
      if (order) {
        await finalizePaidOrder({
          orderId: order._id,
          allowedStatuses: ['PENDING', 'PAYMENT_FAILED']
        });
        return res.redirect(buildClientRedirect('/my-tickets?payment=success'));
      }

      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    } catch (err) {
      logger.error('Momo Return Error:', err);
      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    }
  },

  paypalReturn: async (req, res) =>
    res.redirect(buildClientRedirect('/my-tickets?payment=failed'))
};

export default PaymentController;
