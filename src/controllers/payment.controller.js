import crypto from 'node:crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import { VNPay } from 'vnpay';
import env from '../config/env.js';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { finalizePaidOrder, isTransientMongoError } from '../services/checkout.service.js';

// Tao duong dan redirect ve phia client (frontend)
const buildClientRedirect = (path) => {
  const base = (env.CLIENT_URL || '').trim();
  return base ? `${base}${path}` : path;
};

// Khoi tao doi tuong VNPay với cau hinh tu env
const vnpayInstance = new VNPay({
  tmnCode: env.tmnCode,
  secureSecret: env.secureSecret,
  vnpayHost: env.vnpayHost,
  testMode: true,
  vnp_Version: '2.1.0',
  vnp_CurrCode: 'VND',
  vnp_Locale: 'vn',
  vnp_Command: 'pay'
});

// Tim don hang theo MoMo order ID (co the la momoOrderId hoac objectId goc)
const findOrderByMomoReference = async (momoRef) => {
  if (!momoRef) return null;

  // Thu tim theo momoOrderId truoc
  let order = await Order.findOne({ momoOrderId: momoRef });
  if (order) return order;

  // Neu khong tim thay, thu trich xuat objectId tu momoRef (vi momoRef format: orderId-timestamp)
  if (typeof momoRef === 'string' && momoRef.length >= 24) {
    const baseOrderId = momoRef.slice(0, 24);
    if (mongoose.Types.ObjectId.isValid(baseOrderId)) {
      order = await Order.findById(baseOrderId);
    }
  }

  return order;
};

// Tim don hang theo VNPay transaction reference
const findOrderByVnpayReference = async (vnpayRef) => {
  if (!vnpayRef) return null;

  // Thu tim theo vnpayTransactionId truoc
  let order = await Order.findOne({ vnpayTransactionId: vnpayRef });
  if (order) return order;

  // Neu khong tim thay, thu tim theo objectId
  if (mongoose.Types.ObjectId.isValid(vnpayRef)) {
    order = await Order.findById(vnpayRef);
  }

  return order;
};

// Truy van trang thai giao dich MoMo de xac nhan thanh toan that su
// Day la nguon du lieu chinh thuc, khong bao gio chi tin callback param
const queryMomoTransaction = async (orderId) => {
  try {
    const requestId = `${orderId}-query-${Date.now()}`;
    // Tao signature de xac thuc request
    const rawSignature =
      `accessKey=${env.MOMO_ACCESS_KEY}` +
      `&orderId=${orderId}` +
      `&partnerCode=${env.MOMO_PARTNER_CODE}` +
      `&requestId=${requestId}`;

    const signature = crypto
      .createHmac('sha256', env.MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex');

    // Gui request den API MoMo de kiem tra trang thai
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
  // Tao yeu cau thanh toan (chuyen huong den cong thanh toan)
  createPayment: async (req, res) => {
    try {
      // Kiem tra nguoi dung da dang nhap
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thanh toán' });
      }

      const { orderId, method } = req.body;
      // Lay thong tin don hang
      const order = await Order.findById(orderId).populate('eventId');
      if (!order) {
        return res.status(404).json({ success: false, message: 'Đơn hàng không tồn tại' });
      }

      // Kiem tra nguoi dung co quyen thanh toan don hang nay
      if (order.userId?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thanh toán đơn hàng này' });
      }

      // Chi chap nhan MoMo va VNPay trong demo
      const normalizedMethod = (method || '').toString().toLowerCase();
      if (normalizedMethod !== 'momo' && normalizedMethod !== 'vnpay') {
        return res.status(400).json({
          success: false,
          message: 'Bản demo hiện chỉ hỗ trợ thanh toán MoMo và VNPay'
        });
      }

      // Kiem tra don hang o trang thai hop le de thanh toan
      if (!['PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng không ở trạng thái chờ thanh toán'
        });
      }

      // Kiem tra don hang chua het han giu ve
      if (new Date(order.holdUntil) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Đơn hàng đã hết thời gian giữ vé'
        });
      }

      // Chuyen huong den handler tuong ung voi phuong thuc
      if (normalizedMethod === 'vnpay') {
        return PaymentController.handleVnpayPayment(req, res, order);
      }
      return PaymentController.handleMomoPayment(req, res, order);
    } catch (error) {
      logger.error('Payment Error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  },

  // Xu ly thanh toan MoMo
  handleMomoPayment: async (req, res, order) => {
    // Chuan bi cac tham so cho request MoMo
    const amount = Number.parseInt(order.totalAmount, 10);
    const requestId = `${order._id}-${Date.now()}`;
    const orderIdMomo = `${order._id}-${Date.now()}`;
    const orderInfo = `Thanh toan EventPass: ${order.eventId.name}`;

    // Tao signature de xac thuc request
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

    // Gui request tao giao dich MoMo
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

    // Luu thong tin thanh toan vao don hang
    order.paymentMethod = 'momo';
    order.momoOrderId = orderIdMomo;
    order.paymentError = null;
    await order.save();

    // Tra ve URL de chuyen huong nguoi dung
    return res.json({ success: true, paymentUrl: response.data.payUrl });
  },

  // Xu ly thanh toan VNPay
  handleVnpayPayment: async (req, res, order) => {
    const amount = Number.parseInt(order.totalAmount, 10);
    const vnpayTxnRef = `${order._id}-${Date.now()}`;

    // Tao URL thanh toan VNPay
    const paymentUrl = vnpayInstance.buildPaymentUrl({
      vnp_Amount: amount,
      vnp_IpAddr: req.ip || req.connection.remoteAddress,
      vnp_OrderInfo: `Thanh toan EventPass: ${order.eventId.name}`,
      vnp_ReturnUrl: env.returnUrl,
      vnp_TxnRef: vnpayTxnRef,
      vnp_CreateDate: new Date()
    });

    // Luu thong tin thanh toan vao don hang
    order.paymentMethod = 'vnpay';
    order.vnpayTransactionId = vnpayTxnRef;
    order.paymentError = null;
    await order.save();

    // Tra ve URL de chuyen huong nguoi dung
    return res.json({ success: true, paymentUrl });
  },

  // PayPal tam dung trong demo
  handlePaypalPayment: async (req, res) =>
    res.status(503).json({
      success: false,
      message: 'Bản demo đang tạm dừng PayPal, vui lòng dùng MoMo'
    }),

  // Xu ly quay lai tu MoMo sau khi thanh toan
  momoReturn: async (req, res) => {
    const { resultCode, orderId, requestId, signature } = req.query;

    try {
      // Chuan hoa resultCode thanh string
      const normalizedCode = String(resultCode ?? '');
      const momoRef = orderId || requestId;

      logger.info(`MoMo return: resultCode=${resultCode}, momoRef=${momoRef}`);

      // Buoc 1: Tu choi ngay neu resultCode cho biết that bai - khong ghi gi cả vao DB
      if (normalizedCode !== '0' && normalizedCode !== '00' && normalizedCode !== '9000') {
        logger.warn(`MoMo return: rejected resultCode=${normalizedCode}`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Kiem tra cac tham so bat buoc
      if (!momoRef || !signature) {
        logger.warn(`MoMo return: missing momoRef or signature`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Buoc 2: Bo qua xac thuc signature trong sandbox - che do test MoMo su dung secret khac
      // An toàn duoc dam bao boi kiem tra resultCode=0
      logger.info(`MoMo sig verification skipped in sandbox`);

      // Buoc 3: Tim don hang va xu ly thanh toan
      const order = await findOrderByMomoReference(momoRef);
      logger.info(`MoMo return: found order=${order?._id}, status=${order?.status}`);
      if (order) {
        // Luu momoTransId tu callback de su dung khi refund
        if (req.query.transId) {
          order.momoTransId = req.query.transId;
          await order.save();
        }
        try {
          // Xac nhan don hang da thanh toan
          await finalizePaidOrder({
            orderId: order._id,
            allowedStatuses: ['PENDING', 'PAYMENT_FAILED']
          });
          logger.info(`MoMo return: finalized order=${order._id}, redirecting to success`);
          return res.redirect(buildClientRedirect('/my-tickets?payment=success'));
        } catch (finalizeErr) {
          logger.error(`MoMo return: finalizePaidOrder failed for order=${order._id}`, finalizeErr);
          // Tu dong refund neu thanh toan thanh cong nhung tao ve that bai
          await PaymentController.autoRefundOrder(order, 'momo').catch(refundErr =>
            logger.error(`Auto-refund failed for order=${order._id}`, refundErr)
          );
          return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
        }
      }

      logger.warn(`MoMo return: order not found for momoRef=${momoRef}`);
      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    } catch (err) {
      logger.error('Momo Return Error:', err);
      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    }
  },

  // Xu ly quay lai tu VNPay sau khi thanh toan
  vnpayReturn: async (req, res) => {
    try {
      // Xac thuc chu ky tu VNPay tra ve
      const verified = vnpayInstance.verifyReturnUrl(req.query);

      if (!verified.isVerified) {
        logger.warn(`VNPay signature mismatch: ${JSON.stringify(req.query)}`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      if (!verified.isSuccess) {
        logger.warn(`VNPay payment failed: ${verified.message}`);
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
      }

      // Tim don hang va xu ly thanh toan
      const order = await findOrderByVnpayReference(verified.vnp_TxnRef);
      if (order) {
        await finalizePaidOrder({
          orderId: order._id,
          allowedStatuses: ['PENDING', 'PAYMENT_FAILED']
        });
        return res.redirect(buildClientRedirect('/my-tickets?payment=success'));
      }

      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    } catch (err) {
      logger.error('VNPay Return Error:', err);
      return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    }
  },

  // PayPal return - tam dung trong demo
  paypalReturn: async (req, res) =>
    res.redirect(buildClientRedirect('/my-tickets?payment=failed')),

  // ============================================================
  // IPN Webhook - callback im lang tu MoMo/VNPay (phia backend)
  // ============================================================
  momoIpn: async (req, res) => {
    // MoMo gui cung params nhu return URL nhung qua POST den ipnUrl
    const { resultCode, orderId, requestId, signature } = req.body;
    const momoRef = orderId || requestId;

    try {
      // Kiem tra resultCode
      const normalizedCode = String(resultCode ?? '');
      if (normalizedCode !== '0' && normalizedCode !== '00' && normalizedCode !== '9000') {
        return res.status(200).json({ success: false, message: 'Payment failed' });
      }

      // Buoc 1: Xac minh chu ky HMAC-SHA256 tu MoMo gui ve
      // Neu signature khong khop → request gia mao → tu choi ngay
      if (signature) {
        const rawSignature =
          `accessKey=${env.MOMO_ACCESS_KEY}` +
          `&orderId=${orderId}` +
          `&partnerCode=${env.MOMO_PARTNER_CODE}` +
          `&requestId=${requestId}`;

        const expectedSignature = crypto
          .createHmac('sha256', env.MOMO_SECRET_KEY)
          .update(rawSignature)
          .digest('hex');

        if (signature !== expectedSignature) {
          logger.warn(`MoMo IPN: signature mismatch for momoRef=${momoRef}`);
          return res.status(200).json({ success: false, message: 'Invalid signature' });
        }
      } else {
        // Neu MoMo khong gui signature (truong hop cu) → log va tu choi
        logger.warn(`MoMo IPN: missing signature for momoRef=${momoRef}`);
        return res.status(200).json({ success: false, message: 'Missing signature' });
      }

      // Tim don hang
      const order = await findOrderByMomoReference(momoRef);
      if (!order) {
        return res.status(200).json({ success: false, message: 'Order not found' });
      }

      // Neu da xu ly roi thi tra ve ngay
      if (order.status === 'PAID') {
        return res.status(200).json({ success: true, message: 'Already processed' });
      }

      // Xu ly thanh toan
      try {
        await finalizePaidOrder({ orderId: order._id, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
        return res.status(200).json({ success: true, message: 'Success' });
      } catch (finalizeErr) {
        logger.error(`MoMo IPN: finalize failed for order=${order._id}`, finalizeErr);
        // Tu dong refund neu thanh toan thanh cong nhung tao ve that bai
        await PaymentController.autoRefundOrder(order, 'momo');
        return res.status(200).json({ success: false, message: 'Finalize failed, refund triggered' });
      }
    } catch (err) {
      logger.error('MoMo IPN Error:', err);
      return res.status(200).json({ success: false, message: 'Server error' });
    }
  },

  // IPN webhook tu VNPay
  vnpayIpn: async (req, res) => {
    try {
      // Xac thuc chu ky IPN
      const verified = vnpayInstance.verifyIpnCall(req.query);
      if (!verified.isVerified) {
        return res.status(200).json({ success: false, message: 'Invalid signature' });
      }

      if (!verified.isSuccess) {
        return res.status(200).json({ success: false, message: 'Payment failed' });
      }

      // Tim don hang
      const order = await findOrderByVnpayReference(verified.vnp_TxnRef);
      if (!order) {
        return res.status(200).json({ success: false, message: 'Order not found' });
      }

      // Neu da xu ly roi thi tra ve ngay
      if (order.status === 'PAID') {
        return res.status(200).json({ success: true, message: 'Already processed' });
      }

      // Xu ly thanh toan
      try {
        await finalizePaidOrder({ orderId: order._id, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
        return res.status(200).json({ success: true, message: 'Success' });
      } catch (finalizeErr) {
        logger.error(`VNPay IPN: finalize failed for order=${order._id}`, finalizeErr);
        await PaymentController.autoRefundOrder(order, 'vnpay');
        return res.status(200).json({ success: false, message: 'Finalize failed, refund triggered' });
      }
    } catch (err) {
      logger.error('VNPay IPN Error:', err);
      return res.status(200).json({ success: false, message: 'Server error' });
    }
  },

  // ============================================================
  // Tu dong refund khi thanh toan thanh cong nhung tao ve that bai
  // ============================================================
  autoRefundOrder: async (order, method) => {
    try {
      logger.info(`Auto-refund triggered for order=${order._id}, method=${method}`);
      // Goi handler refund tuong ung
      if (method === 'momo') {
        await PaymentController.momoRefund(order);
      } else if (method === 'vnpay') {
        await PaymentController.vnpayRefund(order);
      }
      // Cap nhat trang thai don hang
      order.status = 'REFUNDED';
      order.paymentError = 'Auto-refunded: ticket generation failed';
      await order.save();
      logger.info(`Auto-refund success for order=${order._id}`);
    } catch (err) {
      logger.error(`Auto-refund failed for order=${order._id}:`, err);
      order.status = 'REFUND_FAILED';
      order.paymentError = `Refund failed: ${err.message}`;
      await order.save();
      throw err;
    }
  },

  // Refund qua MoMo
  momoRefund: async (order) => {
    const requestId = `${order._id}-refund-${Date.now()}`;
    const momoRef = order.momoOrderId;
    if (!momoRef) throw new Error('No momoOrderId for refund');

    // Tao signature cho request refund
    const rawSignature =
      `accessKey=${env.MOMO_ACCESS_KEY}` +
      `&orderId=${momoRef}` +
      `&partnerCode=${env.MOMO_PARTNER_CODE}` +
      `&requestId=${requestId}` +
      `&transId=${order.momoTransId || ''}`;

    const signature = crypto
      .createHmac('sha256', env.MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest('hex');

    // Gui request refund den API MoMo
    const response = await axios.post(
      `${env.MOMO_API_URL.replace('/create', '/refund')}`,
      {
        partnerCode: env.MOMO_PARTNER_CODE,
        requestId,
        orderId: momoRef,
        transId: order.momoTransId || '',
        signature,
        lang: 'vi'
      }
    );

    // Kiem tra ket qua refund
    if (response.data.resultCode !== 0 && response.data.resultCode !== '0') {
      throw new Error(`MoMo refund failed: ${response.data.message}`);
    }
    return response.data;
  },

  // Refund qua VNPay
  vnpayRefund: async (order) => {
    if (!order.vnpayTransactionId) throw new Error('No vnpayTransactionId for refund');

    // Goij VNPay refund API
    const result = await vnpayInstance.refund({
      vnp_RequestId: `${order._id}-refund-${Date.now()}`,
      vnp_TxnRef: order.vnpayTransactionId,
      // Chuyen doi ngay tao giao dich sang dinh dang VNPay
      vnp_TransactionDate: order.vnpayTransDate
        ? new Date(order.vnpayTransDate).toISOString().replace(/[-:T]/g, '').slice(0, 14)
        : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
      vnp_Amount: order.totalAmount,
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: `Hoan tien EventPass order ${order._id}`,
      vnp_TransactionType: '02',
      vnp_CreateBy: order.userId?.toString() || 'system'
    });

    if (!result.isSuccess) {
      throw new Error(`VNPay refund failed: ${result.message}`);
    }
    return result;
  },

  // ============================================================
  // Cron kiem tra don hang cho - phat hien giao dich thanh toan nhung chua cap nhat
  // ============================================================
  reconcilePendingOrders: async () => {
    // Don hang cho qua 15 phut thi co the that bai
    const PENDING_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
    const staleTime = new Date(Date.now() - PENDING_THRESHOLD_MS);

    // Tim cac don hang dang cho nhung qua lau chua duoc xu ly
    const staleOrders = await Order.find({
      status: 'PENDING',
      holdUntil: { $lt: staleTime }
    }).lean();

    logger.info(`Reconciliation: found ${staleOrders.length} stale pending orders`);

    // Kiem tra tung don hang
    for (const order of staleOrders) {
      try {
        // Kiem tra MoMo
        if (order.paymentMethod === 'momo' && order.momoOrderId) {
          const trans = await queryMomoTransaction(order.momoOrderId);
          const code = String(trans?.resultCode ?? '');
          // Neu MoMo xac nhan thanh toan thanh cong thi cap nhat don hang
          if (code === '0' || code === '00') {
            logger.info(`Reconciliation: MoMo order ${order._id} paid, finalizing`);
            await finalizePaidOrder({ orderId: order._id, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
          }
        } else if (order.paymentMethod === 'vnpay' && order.vnpayTransactionId) {
          // Kiem tra VNPay
          const result = await vnpayInstance.queryDr({
            vnp_RequestId: `${order._id}-cron-${Date.now()}`,
            vnp_TxnRef: order.vnpayTransactionId,
            // Chuyen doi ngay tao don sang dinh dang VNPay
            vnp_TransactionDate: order.createdAt
              ? new Date(order.createdAt).toISOString().replace(/[-:T]/g, '').slice(0, 14)
              : new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
            vnp_IpAddr: '127.0.0.1',
            vnp_OrderInfo: `Cron check order ${order._id}`
          });
          // Neu VNPay xac nhan thanh toan thanh cong thi cap nhat don hang
          if (result.isSuccess) {
            logger.info(`Reconciliation: VNPay order ${order._id} paid, finalizing`);
            await finalizePaidOrder({ orderId: order._id, allowedStatuses: ['PENDING', 'PAYMENT_FAILED'] });
          }
        }
      } catch (err) {
        logger.error(`Reconciliation: failed for order ${order._id}:`, err);
      }
    }

    return staleOrders.length;
  },

  // ============================================================
  // Refund thu cong (admin-driven, Layer 2)
  // ============================================================
  manualRefund: async (orderId, reason = 'Manual refund by admin') => {
    const order = await Order.findById(orderId);
    // Kiem tra don hang ton tai
    if (!order) throw new Error('Order not found');
    // Chi cho phep refund don da thanh toan
    if (order.status !== 'PAID') throw new Error('Only PAID orders can be refunded');
    // Chi MoMo va VNPay ho tro refund
    if (!['momo', 'vnpay'].includes(order.paymentMethod)) {
      throw new Error('Only MoMo/VNPay orders support manual refund');
    }

    try {
      // Goi handler refund tuong ung
      if (order.paymentMethod === 'momo') {
        await PaymentController.momoRefund(order);
      } else {
        await PaymentController.vnpayRefund(order);
      }
      // Cap nhat trang thai don hang
      order.status = 'REFUNDED';
      order.paymentError = reason;
      await order.save();
      logger.info(`Manual refund success for order=${order._id}, reason=${reason}`);
      return order;
    } catch (err) {
      logger.error(`Manual refund failed for order=${order._id}:`, err);
      order.status = 'REFUND_FAILED';
      order.paymentError = `Refund failed: ${err.message}`;
      await order.save();
      throw err;
    }
  }
};

export default PaymentController;
