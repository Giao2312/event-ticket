import { query } from 'express-validator';
import Event from '../../models/event.models.js';
import logger from '../../utils/logger.js';

const homeController = {
  index: [
    query('category').optional().isString(),
    query('startDate').optional().isDate(),
    query('endDate').optional().isDate(),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        const { category, startDate, endDate } = req.query;

        const page = Number.parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const events = await Event.find({ category, date: { $gte: startDate, $lte: endDate } })
          .skip(skip)
          .limit(limit);

        const total = await Event.countDocuments({ category, date: { $gte: startDate, $lte: endDate } });

        res.render('client/pages/home/index', {
          pageTitle: 'TicketEvent Pro - Trang chủ',
          events,
          filters: { category: category || 'Tất cả', startDate: startDate || '', endDate: endDate || '' },
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
