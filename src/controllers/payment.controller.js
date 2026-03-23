import crypto from 'node:crypto';
import axios from 'axios';
import mongoose from 'mongoose'; // THÃŠM DÃ’NG NÃ€Y
import env from '../config/env.js';
import Order from '../models/order.models.js';
import Ticket from '../models/ticket.models.js';
import Event from '../models/event.models.js';
import qrcode from 'qrcode';

const buildClientRedirect = (path) => {
    const base = (env.CLIENT_URL || '').trim();
    return base ? `${base}${path}` : path;
};

const PaymentController = {
    createPayment: async (req, res) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({ success: false, message: 'Vui long dang nhap de thanh toan' });
            }

            const { orderId, method } = req.body;
            const order = await Order.findById(orderId).populate('eventId');
            if (!order) return res.status(404).json({ message: 'ÄÆ¡n hÃ ng khÃ´ng tá»“n táº¡i' });
            if (order.userId?.toString() !== req.user.id.toString()) {
                return res.status(403).json({ success: false, message: 'Ban khong co quyen thanh toan don hang nay' });
            }
            const normalizedMethod = (method || '').toString().toLowerCase();
            if (normalizedMethod !== 'momo') {
                return res.status(400).json({
                    success: false,
                    message: 'Ban demo hien chi ho tro thanh toan MoMo'
                });
            }
            if (order.status !== 'PENDING') {
                return res.status(400).json({
                    success: false,
                    message: 'Don hang khong o trang thai cho thanh toan'
                });
            }
            return await PaymentController.handleMomoPayment(req, res, order);
        } catch (error) {
            console.error('Payment Error:', error);
            res.status(500).json({ message: 'Lá»—i server' });
        }
    },

    handleMomoPayment: async (req, res, order) => {
      
    const amount = Number.parseInt(order.totalAmount); 
    const requestId = order._id + Date.now();
    const orderIdMomo = order._id + Date.now();
    const orderInfo = `Thanh toÃ¡n EventPass: ${order.eventId.name}`;
    
    // 2. ChÃº Ã½ thá»© tá»± tham sá»‘ theo chuáº©n MoMo v2
    // accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType
    const rawSignature = `accessKey=${env.MOMO_ACCESS_KEY}&amount=${amount}&extraData=&ipnUrl=${env.MOMO_RETURN_URL}&orderId=${orderIdMomo}&orderInfo=${orderInfo}&partnerCode=${env.MOMO_PARTNER_CODE}&redirectUrl=${env.MOMO_RETURN_URL}&requestId=${requestId}&requestType=captureWallet`;
    
    const signature = crypto.createHmac('sha256', env.MOMO_SECRET_KEY)
                            .update(rawSignature)
                            .digest('hex');

    const response = await axios.post(env.MOMO_API_URL, {
        partnerCode: env.MOMO_PARTNER_CODE,
        partnerName: "EventPass", // ThÃªm náº¿u cáº§n thiáº¿t
        storeId: "MomoTestStore", // ThÃªm náº¿u cáº§n thiáº¿t
        requestId,
        amount, // ÄÃ£ lÃ  Number
        orderId: orderIdMomo,
        orderInfo,
        redirectUrl: env.MOMO_RETURN_URL,
        ipnUrl: env.MOMO_RETURN_URL,
        signature,
        requestType: "captureWallet",
        lang: 'vi',
        extraData: "" // Äáº£m báº£o trÆ°á»ng nÃ y tá»“n táº¡i
    });

    order.paymentMethod = 'momo';
    order.momoOrderId = orderIdMomo;
    await order.save();

    res.json({ success: true, paymentUrl: response.data.payUrl });
},

    handlePaypalPayment: async (req, res, order) => {
        return res.status(503).json({
            success: false,
            message: 'Ban demo dang tam dung PayPal, vui long dung MoMo'
        });
    },

retryPayment: async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id; // Tá»« authMiddleware

    // 1. TÃ¬m order vÃ  kiá»ƒm tra quyá»n sá»Ÿ há»¯u
    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ success: false, message: 'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng hoáº·c báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p' });
    }

    // 2. Chá»‰ cho phÃ©p retry khi á»Ÿ tráº¡ng thÃ¡i lá»—i xá»­ lÃ½
    if (order.status !== 'PROCESSING_ERROR') {
      return res.status(400).json({ 
        success: false, 
        message: 'Chá»‰ cÃ³ thá»ƒ retry Ä‘Æ¡n hÃ ng Ä‘ang á»Ÿ tráº¡ng thÃ¡i lá»—i xá»­ lÃ½ (PROCESSING_ERROR)' 
      });
    }

    // 3. Kiá»ƒm tra thá»i gian hold (náº¿u háº¿t háº¡n â†’ khÃ´ng retry Ä‘Æ°á»£c)
    if (new Date() > new Date(order.holdUntil)) {
      // Optional: cáº­p nháº­t tráº¡ng thÃ¡i thÃ nh expired
      order.status = 'EXPIRED';
      await order.save();
      return res.status(400).json({ 
        success: false, 
        message: 'ÄÆ¡n hÃ ng Ä‘Ã£ háº¿t thá»i gian giá»¯ vÃ©, khÃ´ng thá»ƒ retry' 
      });
    }

    // 4. Retry vá»›i retry logic (trÃ¡nh WriteConflict)
    const MAX_RETRIES = 3;
    let attempt = 1;

    while (attempt <= MAX_RETRIES) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        await PaymentController.completeOrderAndGenerateTickets(orderId, { session });

        await session.commitTransaction();
        await session.endSession();

        // 5. Gá»­i thÃ´ng bÃ¡o (email hoáº·c push notification) â€“ tÃ¹y chá»n
        // await sendOrderSuccessEmail(order.userId, order._id);

        return res.json({ 
          success: true, 
          message: 'ÄÃ£ xá»­ lÃ½ láº¡i Ä‘Æ¡n hÃ ng vÃ  táº¡o vÃ© thÃ nh cÃ´ng',
          orderId: order._id 
        });

      } catch (err) {
        await session.abortTransaction();
        await session.endSession();

        // Náº¿u lÃ  WriteConflict â†’ retry
        if (err.code === 112 || err.errorLabels?.includes('TransientTransactionError')) {
          console.log(`WriteConflict khi retry order ${orderId}, láº§n ${attempt}/${MAX_RETRIES}`);
          if (attempt === MAX_RETRIES) {
            throw new Error('Háº¿t lÆ°á»£t thá»­ láº¡i do xung Ä‘á»™t giao dá»‹ch');
          }
          attempt++;
          continue;
        }

        // Lá»—i khÃ¡c â†’ throw
        throw err;
      }
    }

  } catch (error) {
    console.error('Retry Payment Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Retry tháº¥t báº¡i', 
      error: error.message 
    });
  }
},

    completeOrderAndGenerateTickets: async (orderId) => {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const order = await Order.findById(orderId).session(session);

            if (!order || order.status === 'PAID') {
                await session.abortTransaction();
                session.endSession();
                return order;
            }

            const event = await Event.findById(order.eventId).session(session);
            if (!event) {
                throw new Error('Khong tim thay su kien de xuat ve');
            }

            const ticketsToCreate = [];
            for (const item of order.items) {
                const ticketType = event.ticketTypes.id(item.ticketTypeId);
                if (!ticketType) {
                    throw new Error(`Khong tim thay loai ve: ${item.ticketTypeId}`);
                }

                const holded = ticketType.holded || 0;
                ticketType.holded = Math.max(0, holded - item.quantity);
                ticketType.sold = Math.min(ticketType.quantity, (ticketType.sold || 0) + item.quantity);

                for (let i = 0; i < item.quantity; i++) {
                    const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
                    const qrImage = await qrcode.toDataURL(qrData);

                    ticketsToCreate.push({
                        user: order.userId,
                        event: order.eventId,
                        ticketType: ticketType.type || String(item.ticketTypeId),
                        quantity: 1,
                        price: item.price,
                        status: 'paid',
                        qrCode: qrImage
                    });
                }
            }

            await event.save({ session });
            const createdTickets = await Ticket.insertMany(ticketsToCreate, { session });

            order.status = 'PAID';
            order.paidAt = new Date();
            order.tickets = createdTickets.map(t => t._id);
            await order.save({ session });

            await session.commitTransaction();
            console.log('Transaction thÃ nh cÃ´ng cho Ä‘Æ¡n hÃ ng:', orderId);

        } catch (error) {
            await session.abortTransaction();
            // Sá»­ dá»¥ng findByIdAndUpdate ngoÃ i session Ä‘á»ƒ ghi log lá»—i
            await Order.findByIdAndUpdate(orderId, {
                status: 'PROCESSING_ERROR',
                errorLog: error.message
            });
            console.error('Lá»—i há»‡ thá»‘ng sau khi khÃ¡ch Ä‘Ã£ tráº£ tiá»n:', error);
            throw error;
        } finally {
            session.endSession();
        }
    },

    momoReturn: async (req, res) => {
        const { resultCode, orderId, requestId } = req.query;
        try {
            const normalizedCode = String(resultCode ?? '');
            const isSuccess = normalizedCode === '0' || normalizedCode === '9000';
            const momoRef = orderId || requestId;

            if (isSuccess && momoRef) {
                let order = await Order.findOne({ momoOrderId: momoRef });

                // Fallback cho demo: orderId MoMo co the kem timestamp, lay ObjectId goc
                if (!order && typeof momoRef === 'string' && momoRef.length >= 24) {
                    const baseOrderId = momoRef.slice(0, 24);
                    if (mongoose.Types.ObjectId.isValid(baseOrderId)) {
                        order = await Order.findById(baseOrderId);
                    }
                }

                if (order) {
                    await PaymentController.completeOrderAndGenerateTickets(order._id);
                    return res.redirect(buildClientRedirect('/my-tickets?payment=success'));
                }
            }
            res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
        } catch (err) {
            console.error('Momo Return Error:', err);
            res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
        }
    },

    paypalReturn: async (req, res) => {
        return res.redirect(buildClientRedirect('/my-tickets?payment=failed'));
    }
};

export default PaymentController;

