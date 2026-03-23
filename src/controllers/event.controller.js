import { param, query, validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import {authMiddleware} from '../middlewares/auth.middleware.js';


const eventController = {
  detail: [
    param('id').isMongoId().withMessage('ID sự kiện không hợp lệ'),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg || 'Yêu cầu không hợp lệ',
          errors: errors.array()
        });
      }

      try {
        const eventId = req.params.id;

        // 1. Lấy thông tin sự kiện
        const event = await Event.findById(eventId).populate('organizer', 'name').lean();

        if (!event) {
          return res.status(404).render('clients/page/error/404', {
            pageTitle: 'Không tìm thấy sự kiện',
            message: 'Sự kiện này không tồn tại hoặc đã bị xóa'
          });
        }

    
        const ticketTypes = (event.ticketTypes && event.ticketTypes.length > 0)
          ? event.ticketTypes
          : (event.TicketType || []);

        // 3. Tính toán trên mảng ticketTypes vừa lấy được (không phải trên Model)
        const totalAvailable = ticketTypes.reduce((sum, t) => sum + ((t.quantity || 0) - (t.sold || 0) - (t.holded || 0)), 0);
        
        const minPrice = ticketTypes.length > 0
          ? Math.min(...ticketTypes.map(t => t.price || 0)).toLocaleString('vi-VN')
          : 'Liên hệ';

        // 4. Render với dữ liệu đã chuẩn bị
        res.render('clients/page/events/detail', {
          pageTitle: `${event.name} - TicketEvent`,
          event,
          ticketTypes,
          available: totalAvailable,
          minPrice
        });
      } catch (err) {
        logger.error('Error in event detail:', err);
        res.status(500).render('clients/page/error/500', {
          pageTitle: 'Lỗi máy chủ',
          message: 'Không thể tải thông tin sự kiện. Vui lòng thử lại sau.'
        });
      }
    }
  ],


getAllWeb: async (req, res) => {
  try {
    const categoryQuery = req.query.category;
    const searchQuery = req.query.search;
    const role = (req.user?.role || '').toLowerCase();
    const canSeeInternal = role === 'admin' || role === 'organizer';
    const internalStatuses = ['pending', 'approved', 'published'];
    let timeFilter = req.query.time || 'all';
    const { startDate, endDate } = req.query;
    if (!canSeeInternal && internalStatuses.includes(timeFilter)) timeFilter = 'all';

    const categoryMap = {
      'am-nhac': 'Âm nhạc',
      'am-thuc': 'Ẩm thực',
      'cong-nghe': 'Công nghệ',
      'giai-tri': 'Giải trí',
      'kinh-doanh': 'Kinh doanh',
      'nghe-thuat': 'Nghệ thuật',
      'the-thao': 'Thể thao',
      'workshop': 'Workshop',
      'khac': 'Khác'
    };
    const categorySlug = categoryQuery ? categoryQuery.toLowerCase() : '';
    const categoryName = categoryMap[categorySlug] || categoryQuery;

    // Xử lý active category cho filter button
    const activeCategory = categorySlug || 'tất cả';

    // Xây dựng query lọc
    let matchStage = {};

    // Lọc category (nếu không phải 'tất cả')
    if (categoryQuery && categoryQuery !== 'tất cả') {
      matchStage.category = new RegExp(`^${categoryName}$`, 'i');
    }

    // Lọc search (tên, mô tả, địa điểm)
    if (searchQuery) {
      matchStage.$or = [
        { name: new RegExp(searchQuery, 'i') },
        { description: new RegExp(searchQuery, 'i') },
        { location: new RegExp(searchQuery, 'i') }
      ];
    }

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }
    if (timeFilter && timeFilter !== 'all') {
      matchStage.status = timeFilter;
    }

    const events = await Event.aggregate([
      {
        $lookup: {
          from: 'tickettypes',
          localField: '_id',
          foreignField: 'eventId',
          as: 'tickets'
        }
      },
      {
        $addFields: {
          minPrice: { $min: "$tickets.price" },
          displayPrice: {
            $cond: {
              if: { $gt: [{ $size: "$tickets" }, 0] },
              then: { $concat: [{ $toString: { $min: "$tickets.price" } }, "đ"] },
              else: "Liên hệ"
            }
          }
        }
      },
      { $match: matchStage },  // ← Đưa $match lên đây để lọc trước sort
      { $sort: { date: 1 } },
      { $limit: 20 }  // Giới hạn để load nhanh
    ]);

    // Truyền dữ liệu cho Pug
    res.render('clients/page/events/index', { 
      pageTitle: 'Danh sách sự kiện',
      events,
      categories: [
        { name: 'Âm nhạc', slug: 'am-nhac', icon: 'fa-music' },
        { name: 'Ẩm thực', slug: 'am-thuc', icon: 'fa-utensils' },
        { name: 'Công nghệ', slug: 'cong-nghe', icon: 'fa-robot' },
        { name: 'Giải trí', slug: 'giai-tri', icon: 'fa-grin-stars' },
        { name: 'Kinh doanh', slug: 'kinh-doanh', icon: 'fa-briefcase' },
        { name: 'Nghệ thuật', slug: 'nghe-thuat', icon: 'fa-palette' },
        { name: 'Thể thao', slug: 'the-thao', icon: 'fa-running' },
        { name: 'Workshop', slug: 'workshop', icon: 'fa-graduation-cap' },
        { name: 'Khác', slug: 'khac', icon: 'fa-ellipsis-h' }
      ],
      activeCategory,
      searchQuery: searchQuery || '',
      startDate: startDate || '',
      endDate: endDate || '',
      timeFilter,
      canSeeInternal,
      user: req.user || null
    });
  } catch (err) {
    logger.error('Lỗi render trang sự kiện:', err);
    res.status(500).render('clients/page/error/500');
  }
},

  // --- PHẦN DÀNH CHO API (TRẢ VỀ JSON) ---
  getAllApi: async (req, res) => {
    try {
      const { category, search, time, startDate, endDate } = req.query;
      const role = (req.user?.role || '').toLowerCase();
      const canSeeInternal = role === 'admin' || role === 'organizer';
      const internalStatuses = ['pending', 'approved', 'published'];
      const safeTime = (!canSeeInternal && internalStatuses.includes(time)) ? 'all' : time;
      const query = {};
      if (category) query.category = category;
      if (search) query.name = { $regex: search, $options: 'i' };
      if (safeTime && safeTime !== 'all') query.status = safeTime;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      const events = await Event.find(query).sort({ date: 1 });
      
      // Trả về đúng định dạng mảng, không bọc object dư thừa nếu không cần thiết
      res.status(200).json(events.map(event => ({
        ...event.toObject(),
        image: event.image || '/events/images/placeholder.jpg'
      })));
    } catch (err) {
      res.status(500).json({ success: false, message: 'Lỗi server API' });
    }
  },


  category: [
    query('slug').optional().isString(),
    async (req, res) => {
      try {
        const slug = req.params.slug || req.query.slug;
        const categoryMap = {
          'am-nhac': 'Âm nhạc',
          'the-thao': 'Thể thao',
          'workshop': 'Workshop',
          'khac': 'Khác'
          // thêm các category khác nếu cần
        };
        const categoryName = categoryMap[slug] || 'Tất cả';

        const page = Number.parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const events = await Event.find({ category: categoryName })
          .skip(skip)
          .limit(limit)
          .sort({ date: 1 });

        const total = await Event.countDocuments({ category: categoryName });

        res.render('clients/page/event/category', {
          pageTitle: `${categoryName} - TicketEvent`,
          categoryName,
          events,
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });
      } catch (err) {
        logger.error('Error in event category:', err);
        res.status(500).send('Lỗi Server');
      }
    }
  ],

  createEvent: [
    authMiddleware,
    async (req, res) => {
      try {
        const { name, description, date, location, category, TicketType } = req.body;

        let imageUrl = '';
        if (req.file) {
          imageUrl = `/events/images/${req.file.filename}`;
        }

        // Chuyển TicketType từ string JSON sang array object
        let parsedTicketTypes = [];
        try {
          parsedTicketTypes = JSON.parse(TicketType);
        } catch (e) {
           return res.status(400).json({
            success: false,
            message: 'TicketType không đúng định dạng JSON'
          });
        }

        const event = new Event({
          name,
          description,
          date: new Date(date),
          location,
          category,
          TicketType: parsedTicketTypes,
          image: imageUrl,
          organizer: req.user.id // từ authMiddleware
        });

        await event.save();

        res.status(201).json({
          success: true,
          message: 'Tạo sự kiện thành công',
          event
        });
      } catch (err) {
        logger.error('Error creating event:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
      }
    }
  ],

  booking: [
    authMiddleware,
    async (req, res) => {
      res.render('clients/page/event/booking', { pageTitle: 'Đặt vé' });
    }
  ],

  confirmBooking: [
    authMiddleware,
    async (req, res) => {
      res.render('clients/page/event/confirm', { pageTitle: 'Xác nhận đặt vé' });
    }
  ],

 getDashboardEvents :[ async (req, res) => {
  try {
    const events = await Event.find({}).sort({ date: 1 });

    // Thêm logic tính toán trạng thái cho từng event
    const now = new Date();
    const processedEvents = events.map(event => {
      let status = 'upcoming';
      const eventDate = new Date(event.date);
      if (eventDate < now) {
        status = 'ended';
      } else {
        status = 'upcoming';
      }

      return {
        ...event.toObject(),
        status: status
      };
    });

    res.render('admin/dashboard/events', { 
      pageTitle: 'Quản lý sự kiện',
      events: processedEvents 
    });
  } catch (err) {
    logger.error('Lỗi lấy danh sách sự kiện:', err);
    res.status(500).send('Lỗi Server');
  }
}
 ]

};



export default eventController;
