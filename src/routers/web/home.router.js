import express from 'express';
import homeController from '../../controllers/home.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import Event from '../../models/event.models.js';
import User from '../../models/user.models.js';

const router = express.Router();

router.get('/', authMiddleware, homeController.index);

router.get('/', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 }).limit(10).lean();
    res.render('clients/page/home/index', {
      pageTitle: 'Trang chủ - EventVé',
      events,
      user: req.user || null
    });
  } catch (err) {
    console.error(err);
    res.render('clients/page/home/index', {
      pageTitle: 'Trang chủ - EventVé',
      events: [],
      user: req.user || null
    });
  }
});

router.get('/become-organizer', (req, res) => {
  res.render('clients/page/organizer/become-organizer', {
    pageTitle: 'Trở thành nhà tổ chức - EventVé',
    user: req.user || null
  });
});

router.get('/organizer-terms', (req, res) => {
  res.render('clients/page/organizer/terms', {
    pageTitle: 'Điều khoản nhà tổ chức - EventVé',
    user: req.user || null
  });
});

router.post('/become-organizer/register', authMiddleware, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để đăng ký nhà tổ chức'
      });
    }

    const currentRole = (req.user.role || '').toLowerCase();
    if (currentRole === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Tài khoản admin không thể chuyển thành nhà tổ chức'
      });
    }

    if (currentRole === 'organizer') {
      return res.json({
        success: true,
        message: 'Bạn đã là nhà tổ chức',
        redirect: '/organizer/create-event'
      });
    }

    await User.findByIdAndUpdate(req.user._id, { role: 'Organizer' });

    return res.json({
      success: true,
      message: 'Đăng ký nhà tổ chức thành công',
      redirect: '/organizer/create-event'
    });
  } catch (error) {
    console.error('Become organizer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống khi đăng ký nhà tổ chức'
    });
  }
});

export default router;
