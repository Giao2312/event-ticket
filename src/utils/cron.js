import cron from 'node-cron';
import Order from '../models/order.models.js';
import logger from '../utils/logger.js';
import { expirePendingOrders } from '../services/checkout.service.js';

const startCronJobs = async () => {
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
