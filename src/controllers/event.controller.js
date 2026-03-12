import { param, query, validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import TicketType from '../models/ticketType.models.js';
import logger from '../utils/logger.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import { verifyToken } from '../utils/jwt.js'; 

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

        // 2. Lấy danh sách loại vé từ collection TicketType
        // Phải dùng .lean() để trả về mảng object thuần JS
        const ticketTypes = await TicketType.find({ eventId: eventId }).lean();

        // 3. Tính toán trên mảng ticketTypes vừa lấy được (không phải trên Model)
        const totalAvailable = ticketTypes.reduce((sum, t) => sum + (t.quantity - t.sold - t.holded), 0);
        
        const minPrice = ticketTypes.length > 0
          ? Math.min(...ticketTypes.map(t => t.price)).toLocaleString('vi-VN')
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
                    minPrice: { $min: "$tickets.price" }
                }
            },
            { $sort: { date: 1 } },
            // Đảm bảo chỉ lấy document có name
            { $match: { name: { $exists: true, $ne: null } } }
        ]);

        // "Phẫu thuật" lần cuối: lọc sạch các phần tử lạ
        const cleanEvents = (events || []).filter(e => e && e.name);

        res.render('clients/page/events/index', { 
            pageTitle: 'Danh sách sự kiện',
            events: cleanEvents 
        });
    } catch (err) {
        logger.error('Lỗi render trang sự kiện:', err);
        res.status(500).render('clients/page/error/500');
    }
},

  // --- PHẦN DÀNH CHO API (TRẢ VỀ JSON) ---
  getAllApi: async (req, res) => {
    try {
      const { category, search } = req.query;
      const query = {};
      if (category) query.category = category;
      if (search) query.name = { $regex: search, $options: 'i' };

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


};


export default eventController;
