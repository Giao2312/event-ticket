import cron from 'node-cron';
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

 const startCronJobs = async  () => {
    // 1. Tác vụ hủy đơn quá hạn (đã có của bạn - tối ưu hóa bằng updateMany)
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const expiredOrders = await Order.find({ status: 'PENDING', holdUntil: { $lt: now } });

            for (const order of expiredOrders) {
                const session = await mongoose.startSession();
                await session.withTransaction(async () => {
                    const event = await Event.findById(order.eventId).session(session);
                    for (const item of order.items) {
                        if (!event) continue;
                        const ticketType = event.ticketTypes.id(item.ticketTypeId);
                        if (!ticketType) continue;
                        const holded = ticketType.holded || 0;
                        ticketType.holded = Math.max(0, holded - item.quantity);
                    }
                    if (event) {
                        await event.save({ session });
                    }
                    order.status = 'EXPIRED';
                    await order.save({ session });
                });
                session.endSession();
                logger.info(`Đơn hàng ${order._id} đã hủy do quá hạn.`);
            }
        } catch (err) {
            logger.error('Lỗi cron job hủy đơn hàng:', err);
        }
    });

    // 2. Tác vụ dọn dẹp: Xóa các đơn hàng 'DRAFT' (nháp) tạo quá 24h chưa chuyển PENDING
    cron.schedule('0 3 * * *', async () => { // Chạy lúc 3h sáng hàng ngày
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const result = await Order.deleteMany({
                status: 'DRAFT',
                createdAt: { $lt: twentyFourHoursAgo }
            });
            if (result.deletedCount > 0) {
                logger.info(`Đã dọn dẹp ${result.deletedCount} đơn hàng nháp.`);
            }
        } catch (err) {
            logger.error('Lỗi cron job dọn dẹp đơn hàng:', err);
        }
    });
};

export default startCronJobs ;
