import Order from '../models/order.models.js';
import Event from '../models/event.models.js';
import Ticket from '../models/ticket.models.js';
import TicketType from '../models/ticketType.models.js';
import logger from '../utils/logger.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import mongoose from 'mongoose';

const DashboardController = {
  // Dashboard cho Organizer (Nhà tổ chức sự kiện)
  organizerDashboard: [
    roleMiddleware('Organizer'),
    async (req, res) => {
      try {
        const userId = req.user.id;

        // 1. Tổng quan thống kê
        const totalEvents = await Event.countDocuments({ organizerId: userId });
        const totalTicketsSold = await Ticket.countDocuments({ event: { $in: await Event.find({ organizerId: userId }).distinct('_id') } });
        const totalOrders = await Order.countDocuments({ eventId: { $in: await Event.find({ organizerId: userId }).distinct('_id') } });
        const totalRevenue = await Order.aggregate([
          { $match: { eventId: { $in: await Event.find({ organizerId: userId }).distinct('_id') }, status: 'PAID' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]).then(r => r[0]?.total || 0);

        // 2. Doanh thu & Đơn hàng 6 tháng gần nhất
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyRevenue = await Order.aggregate([
          {
            $match: {
              eventId: { $in: await Event.find({ organizerId: userId }).distinct('_id') },
              status: 'PAID',
              createdAt: { $gte: sixMonthsAgo }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              total: { $sum: "$totalAmount" }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const monthlyOrders = await Order.aggregate([
          {
            $match: {
              eventId: { $in: await Event.find({ organizerId: userId }).distinct('_id') },
              createdAt: { $gte: sixMonthsAgo }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        // 3. Top loại vé bán chạy
        const topTickets = await TicketType.aggregate([
          {
            $match: {
              eventId: { $in: await Event.find({ organizerId: userId }).distinct('_id') }
            }
          },
          {
            $group: {
              _id: { eventId: "$eventId", type: "$type" },
              totalSold: { $sum: "$sold" },
              price: { $first: "$price" }
            }
          },
          { $sort: { totalSold: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'events',
              localField: '_id.eventId',
              foreignField: '_id',
              as: 'event'
            }
          },
          { $unwind: '$event' }
        ]);

        // 4. Sự kiện gần đây (5 sự kiện mới nhất do user tạo)
        const recentEvents = await Event.find({ organizerId: userId })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('name image date status')
          .lean();

        res.render('organizer/dashboard/index', {
          pageTitle: 'Dashboard Nhà tổ chức - EventVé',
          stats: {
            totalEvents,
            totalTicketsSold,
            totalOrders,
            totalRevenue
          },
          monthlyRevenue: monthlyRevenue.map(m => ({ month: m._id, revenue: m.total })),
          monthlyOrders: monthlyOrders.map(m => ({ month: m._id, count: m.count })),
          topTickets,
          recentEvents,
          user: req.user
        });
      } catch (err) {
        logger.error('Lỗi render dashboard organizer:', err);
        res.status(500).render('clients/page/error/500');
      }
    }
  ],

  // Dashboard cho Admin (giữ nguyên hoặc mở rộng nếu cần)
  adminDashboard: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const totalRevenue = await Order.aggregate([
          { $match: { status: 'PAID' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]).then(r => r[0]?.total || 0);

        const totalTicketsSold = await Ticket.countDocuments();
        const activeEvents = await Event.countDocuments({ status: 'upcoming' });

        res.render('admin/dashboard/index', {
          pageTitle: 'Dashboard Admin',
          totalRevenue,
          totalTicketsSold,
          activeEvents
        });
      } catch (err) {
        logger.error('Lỗi render dashboard admin:', err);
        res.status(500).render('admin/page/error/500');
      }
    }
  ]
};

export default DashboardController;
