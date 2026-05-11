import cron from 'node-cron';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { expirePendingOrders } from '../services/checkout.service.js';
import PaymentController from '../controllers/payment.controller.js';

const startCronJobs = async () => {
  // Cron 1: Chạy mỗi phút - hủy đơn PENDING quá 15 phút chưa thanh toán
  cron.schedule('* * * * *', async () => {
    try {
      const expiredCount = await expirePendingOrders();
      if (expiredCount > 0) {
        logger.info(`Da xu ly ${expiredCount} don hang qua han.`);
      }
    } catch (err) {
      logger.error('Loi cron job huy don hang:', err);
    }
  });

  // Cron 2: Chạy mỗi 5 phút - đối soát đơn PENDING với VNPay/MoMo
  // Xử lý trường hợp DB crash sau thanh toán nhưng chưa nhận IPN
  cron.schedule('*/5 * * * *', async () => {
    try {
      const reconciledCount = await PaymentController.reconcilePendingOrders();
      if (reconciledCount > 0) {
        logger.info(`Da doi soat va cap bu ${reconciledCount} don hang.`);
      }
    } catch (err) {
      logger.error('Loi cron job doi soat:', err);
    }
  });

  // Cron 3: Chạy 3h sáng - dọn đơn DRAFT nháp cũ
  cron.schedule('0 3 * * *', async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Order.deleteMany({
        status: 'DRAFT',
        createdAt: { $lt: twentyFourHoursAgo }
      });

      if (result.deletedCount > 0) {
        logger.info(`Da don dep ${result.deletedCount} don hang nhap.`);
      }
    } catch (err) {
      logger.error('Loi cron job don dep don hang:', err);
    }
  });
};

export default startCronJobs;
