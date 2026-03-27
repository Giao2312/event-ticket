import express from 'express';
import Notification from '../../models/notification.models.js';
import Event from '../../models/event.models.js';

const router = express.Router();

// Lấy thông báo cho organizer
router.get('/organizer', async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    // Lấy các sự kiện của organizer
    const events = await Event.find({ organizer: userId }).select('_id name').lean();
    const eventIds = events.map(e => e._id);

    // Lấy thông báo liên quan đến các sự kiện của organizer
    const notifications = await Notification.find({
      $or: [
        { userId },
        { eventId: { $in: eventIds } }
      ]
    })
      .populate('eventId', 'name')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Tính toán thông tin vé bán chậm
    const lowSalesEvents = [];
    for (const event of events) {
      const fullEvent = await Event.findById(event._id).lean();
      if (fullEvent) {
        const totalTickets = fullEvent.ticketTypes?.reduce((sum, t) => sum + (t.quantity || 0), 0) || 0;
        const totalSold = fullEvent.ticketTypes?.reduce((sum, t) => sum + (t.sold || 0), 0) || 0;
        const available = totalTickets - totalSold;
        const fillRate = totalTickets > 0 ? Math.round((totalSold / totalTickets) * 100) : 0;

        // Bán chậm: fillRate < 30% và còn > 7 ngày đến sự kiện
        const daysToEvent = (new Date(fullEvent.date) - new Date()) / (1000 * 60 * 60 * 24);
        if (fillRate < 30 && daysToEvent > 7 && totalSold > 0) {
          lowSalesEvents.push({
            eventId: fullEvent._id,
            eventName: fullEvent.name,
            totalTickets,
            totalSold,
            available,
            fillRate,
            date: fullEvent.date
          });
        }
      }
    }

    // Đánh dấu thông báo chưa đọc
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false
    });

    res.json({
      success: true,
      notifications: notifications.map(n => ({
        _id: n._id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        eventName: n.eventId?.name || null,
        createdAt: n.createdAt
      })),
      lowSalesEvents,
      unreadCount
    });
  } catch (err) {
    console.error('Notification API error:', err);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Đánh dấu đã đọc
router.put('/mark-read/:id', async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Đánh dấu tất cả đã đọc
router.put('/mark-all-read', async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
