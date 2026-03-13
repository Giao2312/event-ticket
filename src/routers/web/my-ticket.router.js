import express from 'express';
import Ticket from '../../models/ticket.models.js'; // Giả sử bạn có model Ticket
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const app = express();
const router = express.Router();
app.get('/my-tickets', authMiddleware, (req, res) => {
  if (!req.user) return res.redirect('/login');   
  res.render('clients/page/my-tickets/index', {
    pageTitle: 'Vé của tôi - EventVé',
    user: req.user || null
  });
});

// Trang Vé của tôi
router.get('/', authMiddleware, async (req, res) => {
  if (!req.user) return res.redirect('/login');

  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .populate('event', 'name image date time location')
      .populate('ticketType', 'name price')
      .sort({ createdAt: -1 })
      .lean();

    res.render('clients/page/my-tickets/index', {
      pageTitle: 'Vé của tôi - EventVé',
      user: req.user,
      tickets
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('clients/page/error/500', { pageTitle: 'Lỗi máy chủ' });
  }
});

export default router;
