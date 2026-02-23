// controllers/dashboard.controller.js
import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Ticket from '../models/ticket.models.js';
import logger from '../utils/logger.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const DashboardController = {

  userDashboard: async (req, res) => {
    try {
      const userId = req.user.id;
      const orders = await Order.find({ userId }).populate('eventId', 'title date').limit(5);
      const tickets = await Ticket.find({ userId }).populate('event', 'name date').limit(5);

      res.render('client/pages/dashboard/user', {
        pageTitle: 'Dashboard Người dùng',
        orders,
        tickets
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('client/pages/error/500');
    }
  },

  adminDashboard: [roleMiddleware('admin'), async (req, res) => {
    try {
      // Aggregate analytics (doanh thu tổng, vé bán, sự kiện active)
      const totalRevenue = await Order.aggregate([{ $match: { status: 'PAID' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
      const totalTicketsSold = await Ticket.countDocuments();
      const activeEvents = await Event.find({ status: 'upcoming' }).countDocuments();

      res.render('admin/pages/dashboard/index', {
        pageTitle: 'Dashboard Admin',
        totalRevenue: totalRevenue[0]?.total || 0,
        totalTicketsSold,
        activeEvents
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('admin/pages/error/500');
    }
  }]
};

export default DashboardController;