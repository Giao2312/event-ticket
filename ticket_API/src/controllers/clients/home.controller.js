
import eventModel from '../../models/event.models.js';

const homeController = {
  index: async (req, res) => {
    try {
      const { category, startDate, endDate } = req.query;
      
      const events = await eventModel.getFilteredEvents({
        category,
        startDate,
        endDate
      });

      res.render('client/pages/home/index', {
        pageTitle: 'TicketEvent Pro - Trang chủ',
        events: events,
        filters: {
          category: category || 'Tất cả',
          startDate: startDate || '',
          endDate: endDate || ''
        },
        categories: ['Tất cả', 'Âm nhạc', 'Hội thảo', 'Thể thao', 'Sân khấu', 'Triển lãm']
      });
    } catch (error) {
      console.error("Home Error:", error);
      res.status(500).send('Lỗi hệ thống');
    }
  }
};

export default homeController;
