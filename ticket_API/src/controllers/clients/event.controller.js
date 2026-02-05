
import eventModel from '../../models/event.models.js';

const eventController = {
  detail: async (req, res) => {
    try {
      const id = req.params.id;
      const event = await eventModel.getById(id);
      
      if (!event) {
        return res.status(404).send('Không tìm thấy sự kiện');
      }

      res.render('client/pages/event/detail', {
        pageTitle: `${event.title} - Ticketbox`,
        event: event
      });
    } catch (error) {
      console.error(error);
      res.status(500).send('Lỗi Server');
    }
  },

  category: async (req, res) => {
    try {
      const slug = req.params.slug;
      const categoryMap = {
        'nhac-song': 'Âm nhạc',
        'san-khau': 'Sân khấu',
        'the-thao': 'Thể thao',
        'hoi-thao': 'Hội thảo',
        'trai-nghiem': 'Tham quan',
        'khac': 'Khác',
        've-ban-lai': 'Vé bán lại'
      };

      const categoryName = categoryMap[slug] || 'Sự kiện';
      const events = await eventModel.getFilteredEvents({ category: categoryName });

      res.render('client/pages/event/category', {
        pageTitle: `${categoryName} - Ticketbox`,
        categoryName: categoryName,
        events: events
      });
    } catch (error) {
      res.status(500).send('Lỗi Server');
    }
  },

  booking: async (req, res) => {
    res.send('Trang đặt vé');
  },

  confirmBooking: async (req, res) => {
    res.send('Xác nhận đặt vé');
  }
};

export default eventController;
