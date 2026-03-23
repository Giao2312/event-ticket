import { body, validationResult } from 'express-validator';
import roleMiddleware from '../middlewares/role.middleware.js';
import Event from '../models/event.models.js';
import Order from '../models/order.models.js';
import User from '../models/user.models.js';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';


const AdminController = {
  createEventByAdmin : [

    body('name').trim().isLength({ min: 5 }),
    body('organizer').isMongoId().withMessage('Pháº£i chá»n organizer há»£p lá»‡'),   
    body('date').isISO8601(),
    body('location').notEmpty(),
    body('capacity').isInt({ min: 1 }),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        // === PHáº¦N KHÃC BIá»†T Lá»šN NHáº¤T ===
        const adminId = req.user._id;
        const targetOrganizerId = req.body.organizer;        // â† Admin chá»n organizer khÃ¡c

        // Kiá»ƒm tra admin
        if (!req.user.isAdmin) {
          return res.status(403).json({ success: false, message: 'Chá»‰ admin má»›i Ä‘Æ°á»£c táº¡o sá»± kiá»‡n cho ngÆ°á»i khÃ¡c' });
        }

        // Kiá»ƒm tra organizer tá»“n táº¡i
        const organizerExists = await User.findById(targetOrganizerId);
        if (organizerExists?.role !== 'organizer') {
          return res.status(400).json({ success: false, message: 'Organizer khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng há»£p lá»‡' });
        }

        const eventData = {
          ...req.body,
          organizer: targetOrganizerId,                      // â† KhÃ´ng pháº£i req.user
          createdBy: adminId,                                // lÆ°u láº¡i admin nÃ o táº¡o
          status: req.body.status || 'draft',
          slug: slugify(req.body.name, { lower: true })
        };

        const newEvent = await Event.create(eventData);

        logger.info(`Admin ${req.user.name} Ä‘Ã£ táº¡o sá»± kiá»‡n "${newEvent.name}" cho organizer ${targetOrganizerId}`);

        res.status(201).json({
          success: true,
          message: `Táº¡o sá»± kiá»‡n thÃ nh cÃ´ng cho organizer ${organizerExists.name}`,
          event: newEvent
        });
      } catch (err) {
        logger.error('Admin createEvent error:', err);
        res.status(500).json({ success: false, message: 'Lá»—i server' });
      }
    }
  ],

  getDashboard: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const now = new Date();
        const startDay = new Date(now);
        startDay.setDate(now.getDate() - 13);
        startDay.setHours(0, 0, 0, 0);

        const [
          totalEvents,
          totalUsers,
          totalRevenueData,
          ticketsSoldData,
          capacityData,
          trafficData,
          paidOrdersCount,
          recentEvents,
          revenueByDayData,
          ticketsByDayData,
          revenueByPaymentData,
          recentOrders,
          pendingCount,
          rejectedCount,
          upcomingCount,
          ongoingCount,
          endedCount
        ] = await Promise.all([
          Event.countDocuments({}),
          User.countDocuments({}),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $unwind: '$items' },
            { $group: { _id: null, totalSold: { $sum: '$items.quantity' } } }
          ]),
          Event.aggregate([
            { $unwind: { path: '$ticketTypes', preserveNullAndEmptyArrays: true } },
            { $group: { _id: null, totalCapacity: { $sum: { $ifNull: ['$ticketTypes.quantity', 0] } } } }
          ]),
          Event.aggregate([
            { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$views', 0] } } } }
          ]),
          Order.countDocuments({ status: 'PAID' }),
          Event.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('organizer', 'name')
            .lean(),
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: '$totalAmount' } } },
            { $sort: { _id: 1 } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID', createdAt: { $gte: startDay } } },
            { $unwind: '$items' },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, tickets: { $sum: '$items.quantity' } } },
            { $sort: { _id: 1 } }
          ]),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: '$paymentMethod', total: { $sum: '$totalAmount' } } },
            { $sort: { total: -1 } }
          ]),
          Order.find({})
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('userId', 'name')
            .lean(),
          Event.countDocuments({ status: 'pending' }),
          Event.countDocuments({ status: 'rejected' }),
          Event.countDocuments({ status: 'upcoming' }),
          Event.countDocuments({ status: 'ongoing' }),
          Event.countDocuments({ status: 'ended' })
        ]);

        const totalRevenue = totalRevenueData[0]?.total || 0;
        const ticketsSold = ticketsSoldData[0]?.totalSold || 0;
        const totalCapacity = capacityData[0]?.totalCapacity || 0;
        const traffic = trafficData[0]?.totalViews || 0;
        const fillRate = totalCapacity > 0 ? Math.round((ticketsSold / totalCapacity) * 100) : 0;
        const conversionRate = traffic > 0 ? Number(((paidOrdersCount / traffic) * 100).toFixed(2)) : 0;

        const formatDate = (d) => d.toISOString().slice(0, 10);
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(startDay);
          d.setDate(startDay.getDate() + i);
          return d;
        });
        const revenueMap = new Map(revenueByDayData.map(d => [d._id, d.revenue]));
        const ticketsMap = new Map(ticketsByDayData.map(d => [d._id, d.tickets]));
        const lineLabels = days.map(d => formatDate(d));
        const lineRevenue = lineLabels.map(l => revenueMap.get(l) || 0);
        const lineTickets = lineLabels.map(l => ticketsMap.get(l) || 0);

        const pieLabels = (revenueByPaymentData || []).map(p => p._id || 'unknown');
        const pieValues = (revenueByPaymentData || []).map(p => p.total || 0);

        const stats = {
          totalEvents,
          totalUsers,
          totalRevenue,
          ticketsSold,
          totalCapacity,
          fillRate,
          traffic,
          conversionRate
        };

        res.render('admin/dashboard/index', {
          pageTitle: 'Dashboard Quản trị',
          events: recentEvents || [],
          pendingCount,
          rejectedCount,
          upcomingCount,
          ongoingCount,
          endedCount,
          user: req.user,
          stats,
          recentOrders: recentOrders || [],
          lineChart: { labels: lineLabels, revenue: lineRevenue, tickets: lineTickets },
          pieChart: { labels: pieLabels, values: pieValues }
        });
      } catch (err) {
        logger.error('Admin Dashboard Error:', err);
        console.error(err);

        res.render('admin/dashboard/index', {
          pageTitle: 'Dashboard Quản trị',
          user: req.user,
          stats: {
            totalEvents: 0,
            totalUsers: 0,
            totalRevenue: 0,
            ticketsSold: 0,
            totalCapacity: 0,
            fillRate: 0,
            traffic: 0,
            conversionRate: 0
          },
          events: [],
          recentOrders: [],
          lineChart: { labels: [], revenue: [], tickets: [] },
          pieChart: { labels: [], values: [] },
          errorMessage: 'Không thể tải dữ liệu dashboard'
        });
      }
    }
  ],
   manageOrders: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = 10;
        const skip = (page - 1) * limit;
        const statusRaw = (req.query.status || '').toString().trim();
        const status = statusRaw ? statusRaw.toUpperCase() : '';
        const q = (req.query.q || '').toString().trim();

        const match = {};
        if (status) match.status = status;

        const pipeline = [
          { $match: match },
          { $addFields: { totalItems: { $sum: '$items.quantity' } } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'events', localField: 'eventId', foreignField: '_id', as: 'event' } },
          { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } }
        ];

        if (q) {
          const or = [
            { 'user.name': { $regex: q, $options: 'i' } },
            { 'user.email': { $regex: q, $options: 'i' } },
            { 'event.name': { $regex: q, $options: 'i' } }
          ];
          if (mongoose.Types.ObjectId.isValid(q)) {
            or.push({ _id: new mongoose.Types.ObjectId(q) });
          }
          pipeline.push({ $match: { $or: or } });
        }

        pipeline.push(
          { $sort: { createdAt: -1 } },
          {
            $facet: {
              data: [{ $skip: skip }, { $limit: limit }],
              total: [{ $count: 'count' }]
            }
          }
        );

        const agg = await Order.aggregate(pipeline);
        const orders = agg[0]?.data || [];
        const total = agg[0]?.total?.[0]?.count || 0;
        const totalPages = Math.max(Math.ceil(total / limit), 1);

        const [paidCount, pendingCount, cancelledCount, expiredCount] = await Promise.all([
          Order.countDocuments({ status: 'PAID' }),
          Order.countDocuments({ status: 'PENDING' }),
          Order.countDocuments({ status: 'CANCELLED' }),
          Order.countDocuments({ status: 'EXPIRED' })
        ]);

        res.render('admin/dashboard/orders', {
          pageTitle: 'Quản lý đơn hàng',
          orders,
          filters: { status: statusRaw, q },
          stats: { paidCount, pendingCount, cancelledCount, expiredCount },
          pagination: { page, totalPages, total }
        });
      } catch (err) {
        logger.error('Admin manageOrders error:', err);
        res.render('admin/dashboard/orders', {
          pageTitle: 'Quản lý đơn hàng',
          orders: [],
          filters: { status: '', q: '' },
          stats: { paidCount: 0, pendingCount: 0, cancelledCount: 0, expiredCount: 0 },
          pagination: { page: 1, totalPages: 1, total: 0 },
          errorMessage: 'Không tải được danh sách đơn hàng'
        });
      }
    }
  ],
manageEvents: [
  roleMiddleware('admin'),
    async (req, res) => {
      try {
        const events = await Event.find({})
          .sort({ createdAt: -1 })
          .populate('organizer', 'name email')  
          .lean(); 

        // TÃ­nh count cho cÃ¡c banner (náº¿u dÃ¹ng)
        const pendingCount = await Event.countDocuments({ status: 'pending' });
        const rejectedCount = await Event.countDocuments({ status: 'rejected' });
        const upcomingCount = await Event.countDocuments({ status: 'upcoming' });
        const ongoingCount = await Event.countDocuments({ status: 'ongoing' });
        const endedCount   = await Event.countDocuments({ status: 'ended' });

        res.render('admin/dashboard/index', {  // â† tÃªn file Pug chÃ­nh xÃ¡c
          pageTitle: 'Quáº£n lÃ½ sá»± kiá»‡n',
          events: events || [],                     // â† Báº®T BUá»˜C: luÃ´n truyá»n máº£ng, dÃ¹ rá»—ng
          pendingCount,
          rejectedCount,
          upcomingCount,
          ongoingCount,
          endedCount,
          user: req.user
        });
      } catch (err) {
        console.error('Lá»—i load events admin:', err);
        res.render('admin/dashboard/events/index', {
          pageTitle: 'Quáº£n lÃ½ sá»± kiá»‡n',
          events: [],                               // fallback máº£ng rá»—ng
          pendingCount: 0,
          rejectedCount: 0,
          upcomingCount: 0,
          ongoingCount: 0,
          endedCount: 0,
          user: req.user,
          errorMessage: 'KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch sá»± kiá»‡n'
        });
      }
    }
  ],
  
  approveEvent :[
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { notes } = req.body;  // optional: ghi chÃº

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: 'KhÃ´ng tÃ¬m tháº¥y sá»± kiá»‡n' });

        if (event.status !== 'pending') {
          return res.status(400).json({ success: false, message: 'Sá»± kiá»‡n khÃ´ng á»Ÿ tráº¡ng thÃ¡i chá» duyá»‡t' });
        }

        event.status = 'approved';
        event.approvedBy = req.user._id;
        event.approvedAt = new Date();
        event.approvalNotes = notes || 'ÄÃ£ duyá»‡t tá»± Ä‘á»™ng';

        await event.save();

        // ThÃ´ng bÃ¡o láº¡i cho organizer
        await sendOrganizerNotification(event.organizer, {
          type: 'event_approved',
          eventName: event.name,
          message: 'Sá»± kiá»‡n cá»§a báº¡n Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t vÃ  cÃ³ thá»ƒ publish.'
        });

        res.json({ success: true, message: 'Sá»± kiá»‡n Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t', event });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Lá»—i khi duyá»‡t sá»± kiá»‡n' });
      }
    }
  ],

  rejectEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { eventId } = req.params;
        const { reason } = req.body;  // báº¯t buá»™c khi reject

        const event = await Event.findById(eventId);
        if (!event || event.status !== 'pending') {
          return res.status(400).json({ success: false, message: 'KhÃ´ng há»£p lá»‡' });
        }

        event.status = 'rejected';
        event.rejectionReason = reason;
        await event.save();

        // ThÃ´ng bÃ¡o cho organizer lÃ½ do reject
        await sendOrganizerNotification(event.organizer, {
          type: 'event_rejected',
          eventName: event.name,
          reason
        });

        res.json({ success: true, message: 'Sá»± kiá»‡n Ä‘Ã£ bá»‹ tá»« chá»‘i' });
      } catch (err) {
        // error
      }
    }
  ],
  // XÃ³a sá»± kiá»‡n vi pháº¡m
  deleteEvent: [
    roleMiddleware('admin'),
    async (req, res) => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const { eventId } = req.params;
        
        // 1. Kiá»ƒm tra sá»± kiá»‡n
        const event = await Event.findById(eventId).session(session);
        if (!event) throw new Error('Sá»± kiá»‡n khÃ´ng tá»“n táº¡i');

        // 2. XÃ³a cÃ¡c vÃ© liÃªn quan (Ä‘á»ƒ trÃ¡nh lá»—i dá»¯ liá»‡u má»“ cÃ´i)
        await Ticket.deleteMany({ eventId }, { session });
        
        // 3. XÃ³a chÃ­nh sá»± kiá»‡n
        await Event.findByIdAndDelete(eventId, { session });

        await session.commitTransaction();
        await logAction(
            req.user.id,             // ID cá»§a Admin
            'DELETE_EVENT',          // HÃ nh Ä‘á»™ng
            eventId,                 // ID sá»± kiá»‡n bá»‹ xÃ³a
            'Event',                 // Model
            { eventName: event.name, reason: 'Vi pháº¡m chÃ­nh sÃ¡ch' } // ThÃ´ng tin thÃªm
          );
          
        res.json({ success: true, message: 'ÄÃ£ xÃ³a sá»± kiá»‡n' });
        res.json({ success: true, message: 'ÄÃ£ xÃ³a sá»± kiá»‡n thÃ nh cÃ´ng' });
      } catch (err) {
        await session.abortTransaction();
        res.status(500).json({ success: false, message: err.message });
      } finally {
        session.endSession();
      }
    }
  ],

  toggleUserStatus: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'NgÆ°á»i dÃ¹ng khÃ´ng tá»“n táº¡i' });

        // Äáº£o ngÆ°á»£c tráº¡ng thÃ¡i isActive
        user.isActive = !user.isActive;
        await user.save();

        res.json({ success: true, message: `ÄÃ£ ${user.isActive ? 'má»Ÿ khÃ³a' : 'khÃ³a'} tÃ i khoáº£n` });
      } catch (err) {
        res.status(500).json({ success: false, message: 'Lá»—i server' });
      }
    }
  ],

  getLogs: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        
        const logs = await AuditLog.find({})
          .populate('adminId', 'name') // Láº¥y tÃªn Admin
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);

        const total = await AuditLog.countDocuments({});

        res.render('admin/logs', { 
          pageTitle: 'Quáº£n lÃ½ Logs',
          logs,
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });
      } catch (err) {
        res.status(500).send('Lá»—i láº¥y dá»¯ liá»‡u log');
      }
    }
  ]
};


export default AdminController;
