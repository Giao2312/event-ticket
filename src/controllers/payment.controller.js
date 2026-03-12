import crypto from 'node:crypto';
import axios from 'axios';
import paypal from "@paypal/checkout-server-sdk";
import mongoose from 'mongoose'; // THÊM DÒNG NÀY
import env from '../config/env.js';
import Order from '../models/order.models.js';
import Ticket from '../models/ticket.models.js';
import qrcode from 'qrcode';

const environment = new paypal.core.SandboxEnvironment(env.PAYPAL_CLIENT_ID, env.PAYPAL_SECRET);
const paypalClient = new paypal.core.PayPalHttpClient(environment);

const PaymentController = {
    createPayment: async (req, res) => {
        try {
            const { orderId, method } = req.body;
            const order = await Order.findById(orderId).populate('eventId');
            if (!order) return res.status(404).json({ message: 'Đơn hàng không tồn tại' });

            // Sửa lại cách gọi hàm để tránh lỗi 'this' undefined
            if (method === 'momo') {
                return await PaymentController.handleMomoPayment(req, res, order);
            } else if (method === 'paypal') {
                return await PaymentController.handlePaypalPayment(req, res, order);
            }

            res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' });
        } catch (error) {
            console.error('Payment Error:', error);
            res.status(500).json({ message: 'Lỗi server' });
        }
    },

    handleMomoPayment: async (req, res, order) => {
      
    const amount = Number.parseInt(order.totalAmount); 
    const requestId = order._id + Date.now();
    const orderIdMomo = order._id + Date.now();
    const orderInfo = `Thanh toán EventPass: ${order.eventId.name}`;
    
    // 2. Chú ý thứ tự tham số theo chuẩn MoMo v2
    // accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType
    const rawSignature = `accessKey=${env.MOMO_ACCESS_KEY}&amount=${amount}&extraData=&ipnUrl=${env.MOMO_RETURN_URL}&orderId=${orderIdMomo}&orderInfo=${orderInfo}&partnerCode=${env.MOMO_PARTNER_CODE}&redirectUrl=${env.MOMO_RETURN_URL}&requestId=${requestId}&requestType=captureWallet`;
    
    const signature = crypto.createHmac('sha256', env.MOMO_SECRET_KEY)
                            .update(rawSignature)
                            .digest('hex');

    const response = await axios.post(env.MOMO_API_URL, {
        partnerCode: env.MOMO_PARTNER_CODE,
        partnerName: "EventPass", // Thêm nếu cần thiết
        storeId: "MomoTestStore", // Thêm nếu cần thiết
        requestId,
        amount, // Đã là Number
        orderId: orderIdMomo,
        orderInfo,
        redirectUrl: env.MOMO_RETURN_URL,
        ipnUrl: env.MOMO_RETURN_URL,
        signature,
        requestType: "captureWallet",
        lang: 'vi',
        extraData: "" // Đảm bảo trường này tồn tại
    });

    order.paymentMethod = 'momo';
    order.momoOrderId = orderIdMomo;
    await order.save();

    res.json({ success: true, paymentUrl: response.data.payUrl });
},

    handlePaypalPayment: async (req, res, order) => {
        const request = new paypal.orders.OrdersCreateRequest();
        // Tính tỷ giá USD (Nên để 25000 hoặc tỷ giá thực tế)
        const usdAmount = (order.totalAmount / 25000).toFixed(2);
        
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: { currency_code: 'USD', value: usdAmount },
                description: `EventPass Ticket: ${order.eventId.name}`
            }],
            application_context: { 
                return_url: env.PAYPAL_RETURN_URL, 
                cancel_url: env.PAYPAL_CANCEL_URL 
            }
        });

        const response = await paypalClient.execute(request);
        order.paymentMethod = 'paypal';
        order.paypalOrderId = response.result.id;
        await order.save();

        const approveLink = response.result.links.find(link => link.rel === 'approve').href;
        res.json({ success: true, paymentUrl: approveLink });
    },

    retryPayment: async (req, res) => {
        try {
            const { orderId } = req.params;
            const order = await Order.findById(orderId);

            if (!order) {
                return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
            }

            // Chỉ cho phép Retry nếu đơn hàng đang bị lỗi xử lý
            if (order.status !== 'PROCESSING_ERROR') {
                return res.status(400).json({ 
                    message: 'Chỉ có thể retry đơn hàng đang ở trạng thái lỗi xử lý (PROCESSING_ERROR)' 
                });
            }

            // Gọi lại hàm xử lý chung đã có Transaction
            await PaymentController.completeOrderAndGenerateTickets(orderId);

            res.json({ 
                success: true, 
                message: 'Đã xử lý lại đơn hàng và tạo vé thành công' 
            });
        } catch (error) {
            console.error('Retry Payment Error:', error);
            res.status(500).json({ 
                message: 'Retry thất bại', 
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

            order.status = 'PAID';
            order.paidAt = new Date();
            await order.save({ session });

            const ticketsToCreate = [];
            for (const item of order.items) {
                for (let i = 0; i < item.quantity; i++) {
                    const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
                    const qrImage = await qrcode.toDataURL(qrData);

                    ticketsToCreate.push({
                        orderId: order._id,
                        ticketTypeId: item.ticketTypeId,
                        userId: order.userId,
                        qrCode: qrImage,
                        code: qrData
                    });
                }
            }

            await Ticket.insertMany(ticketsToCreate, { session });
            await session.commitTransaction();
            console.log('Transaction thành công cho đơn hàng:', orderId);

        } catch (error) {
            await session.abortTransaction();
            // Sử dụng findByIdAndUpdate ngoài session để ghi log lỗi
            await Order.findByIdAndUpdate(orderId, {
                status: 'PROCESSING_ERROR',
                errorLog: error.message
            });
            console.error('Lỗi hệ thống sau khi khách đã trả tiền:', error);
            throw error;
        } finally {
            session.endSession();
        }
    },

    momoReturn: async (req, res) => {
        const { resultCode, orderId } = req.query;
        try {
            if (resultCode === '0') {
                const order = await Order.findOne({ momoOrderId: orderId });
                if (order) {
                    await PaymentController.completeOrderAndGenerateTickets(order._id);
                    return res.redirect(`${env.CLIENT_URL}/payment/success`);
                }
            }
            res.redirect(`${env.CLIENT_URL}/payment/failed`);
        } catch (err) {
            console.error('Momo Return Error:', err);
            res.redirect(`${env.CLIENT_URL}/payment/failed`);
        }
    },

    paypalReturn: async (req, res) => {
        const { token } = req.query;
        try {
            const request = new paypal.orders.OrdersCaptureRequest(token);
            const capture = await paypalClient.execute(request);

            if (capture.result.status === 'COMPLETED') {
                const order = await Order.findOne({ paypalOrderId: token });
                if (order) {
                    await PaymentController.completeOrderAndGenerateTickets(order._id);
                    return res.redirect(`${env.CLIENT_URL}/payment/success`);
                }
            }
            res.redirect(`${env.CLIENT_URL}/payment/failed`);
        } catch (err) {
            console.error('Paypal Return Error:', err);
            res.redirect(`${env.CLIENT_URL}/payment/failed`);
        }
    }
};

export default PaymentController;
