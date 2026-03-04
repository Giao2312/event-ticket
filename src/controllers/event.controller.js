
import { param, query, validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import logger from '../utils/logger.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const eventController = {
 detail: async (req, res) => {
    try {
      const eventId = req.params.id;

      const event = await Event.findById(eventId)
        .populate('ticketTypes')          
        .populate('organizer', 'name');   
      console.log('Event tìm thấy:', event ? event.name : 'Không tìm thấy');
      if (!event) {
        return res.status(404).render('clients/page/error/404', {
          pageTitle: 'Không tìm thấy sự kiện',
          message: 'Sự kiện này không tồn tại hoặc đã bị xóa'
           
        });
      }

      const minPrice = event.ticketTypes?.length > 0
        ? Math.min(...event.ticketTypes.map(t => t.price)).toLocaleString('vi-VN')
        : 'Liên hệ';

      const available = event.availableTickets || 0;

      res.render('clients/page/event/detail', {
        pageTitle: `${event.name} - TicketEvent`,
        event,
        available,
        minPrice
      });
    } catch (err) {
      logger.error('Error in event detail:', err);
      res.status(500).render('clients/page/error/500', {
        pageTitle: 'Lỗi máy chủ',
        message: 'Không thể tải thông tin sự kiện. Vui lòng thử lại sau.'
      });
      
    }
   
  },

  category: [
    query('slug').optional().isString(),
    async (req, res) => {
      try {
        const slug = req.params.slug;
        const categoryMap = { /* ... */ };
        const categoryName = categoryMap[slug] || 'Tất cả';

        const page = Number.parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const events = await Event.find({ category: categoryName })
          .skip(skip)
          .limit(limit);

        const total = await Event.countDocuments({ category: categoryName });

        res.render('client/pages/event/category', {
          pageTitle: `${categoryName} - Ticketbox`,
          categoryName,
          events,
          pagination: { page, totalPages: Math.ceil(total / limit) }
        });
      } catch (err) {
        logger.error(err);
        res.status(500).send('Lỗi Server');
      }
    }
  ],

    booking: [authMiddleware, async (req, res) => {

    res.render('client/pages/event/booking', { pageTitle: 'Đặt vé' });
  }],

  confirmBooking: [authMiddleware, async (req, res) => {
   
    res.render('client/pages/event/confirm', { pageTitle: 'Xác nhận đặt vé' });
  }]

};


export default eventController;
