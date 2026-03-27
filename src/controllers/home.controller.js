import { validationResult } from 'express-validator';
import Event from '../models/event.models.js';
import logger from '../utils/logger.js';

const homeController = {
  index: [
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Yeu cau khong hop le'
        });
      }

      try {
        const allowedStatuses = ['ongoing', 'upcoming', 'published'];

        const featuredEventsRaw = await Event.find()
          .sort({ createdAt: -1 })
          .limit(4);

        const timelineEventsRaw = await Event.find({
          status: { $in: allowedStatuses }
        })
          .sort({ date: 1 })
          .limit(8);

        const formatEvents = (eventList) => {
          return eventList.map((event) => {
            const firstTicket = event.ticketTypes?.[0] || null;
            return {
              ...event.toObject(),
              displayPrice: firstTicket
                ? `${firstTicket.price.toLocaleString('vi-VN')} VND`
                : 'Lien he gia'
            };
          });
        };

        return res.render('clients/page/home/index', {
          pageTitle: 'TicketEvent Pro - Trang chu',
          featuredEvents: formatEvents(featuredEventsRaw),
          events: formatEvents(timelineEventsRaw)
        });
      } catch (err) {
        logger.error(err);
        return res.status(500).send('Loi he thong');
      }
    }
  ]
};

export default homeController;
