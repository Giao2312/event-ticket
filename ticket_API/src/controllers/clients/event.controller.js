// controllers/event.controller.js
import { param, query } from 'express-validator';
import Event from '../../models/event.models.js';

const eventController = {
  detail: [
    param('id').isMongoId().withMessage('Invalid event ID'),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).send('Không tìm thấy sự kiện');

        const available = event.availableTickets;

        res.render('client/pages/event/detail', {
          pageTitle: `${event.title} - Ticketbox`,
          event,
          available
        });
      } catch (err) {
        logger.error(err);
        res.status(500).send('Lỗi Server');
      }
    }
  ],

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
