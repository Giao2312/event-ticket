import { query, validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import logger from '../utils/logger.js';

const homeController = {
  index: [
    query('category').optional().isString(),
    query('startDate').optional().isDate(),
    query('endDate').optional().isDate(),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) 
        return res.status(400).json({
            success: false,
            message: 'Yêu cầu không hợp lệ'
          });

      try {
        const { category, startDate, endDate, time } = req.query;
        const role = (req.user?.role || '').toLowerCase();
        const canSeeInternal = role === 'admin' || role === 'organizer';
        const internalStatuses = ['pending', 'approved', 'published'];
        let timeFilter = time || 'all';
        if (!canSeeInternal && internalStatuses.includes(timeFilter)) timeFilter = 'all';

        // 1. Lấy dữ liệu cho phần "Sự kiện nổi bật" (Featured) - Lấy 4 cái mới nhất
        const featuredEventsRaw = await Event.find()
          .sort({ createdAt: -1 })
          .limit(4);

        // 2. Lấy dữ liệu cho phần "Sắp diễn ra" (Upcoming) - Ngày gần hiện tại nhất
        const upcomingEventsRaw = await Event.find({
          date: { $gte: new Date() }
        })
          .sort({ date: 1 })
          .limit(4);

        // 3. Logic xử lý Filter cho danh sách chính (giữ nguyên logic cũ của bạn)
        const page = Number.parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const filterQuery = {};
        if (category && category !== 'Tất cả') filterQuery.category = category;
        if (startDate || endDate) {
          filterQuery.date = {};
          if (startDate) filterQuery.date.$gte = new Date(startDate);
          if (endDate) filterQuery.date.$lte = new Date(endDate);
        }
        if (timeFilter && timeFilter !== 'all') {
          filterQuery.status = timeFilter;
        }

        const events = await Event.find(filterQuery)
          .skip(skip)
          .limit(limit);

        const total = await Event.countDocuments(filterQuery);

        // Hàm tiện ích để format giá hiển thị
        const formatEvents = (eventList) => {
          return eventList.map(event => {
            const firstTicket = event.ticketTypes?.[0] || null;
            return {
              ...event.toObject(),
              displayPrice: firstTicket 
                ? firstTicket.price.toLocaleString('vi-VN') + ' VNĐ'
                : 'Liên hệ giá'
            };
          });
        };

        res.render('clients/page/home/index', {
          pageTitle: 'TicketEvent Pro - Trang chủ',
          featuredEvents: formatEvents(featuredEventsRaw), // Gửi mảng nổi bật
          upcomingEvents: formatEvents(upcomingEventsRaw), // Gửi mảng sắp diễn ra
          events: formatEvents(events),                   // Gửi mảng danh sách chính
          filters: { category: category || 'Tất cả', startDate: startDate || '', endDate: endDate || '', time: timeFilter },
          canSeeInternal,
          categories: ['Tất cả', 'Âm nhạc', 'Hội thảo', 'Thể thao', 'Sân khấu', 'Triển lãm'],
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });

      } catch (err) {
        logger.error(err);
        res.status(500).send('Lỗi hệ thống');
      }
    }
  ]
};

export default homeController;
