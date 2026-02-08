import { body, validationResult } from 'express-validator';
import User from '../../models/user.model.js';
import Order from '../../models/order.model.js';
import logger from '../../utils/logger.js';
import authMiddleware from '../../middlewares/auth.js';

const userController = {
  profile: [authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId).select('-password');

      const page = Number.parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (page - 1) * limit;

      const transactions = await Order.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Order.countDocuments({ userId });

      res.render('client/pages/user/profile', {
        pageTitle: 'Quản lý tài khoản - Ticketbox',
        user,
        transactions,
        pagination: { page, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      logger.error(err);
      res.status(500).render('client/pages/error/500');
    }
  }],

  updateProfile: [
    authMiddleware,
    body('name').trim().isLength({ min: 3 }).withMessage('Họ tên không hợp lệ'),
    body('phone').optional().isMobilePhone().withMessage('Số điện thoại không hợp lệ'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).render('client/pages/user/profile', { errors: errors.array() });

      try {
        const userId = req.user.id;
        const { name, phone, dob, address } = req.body;

        await User.findByIdAndUpdate(userId, { name, phone, dob, address, updatedAt: new Date() });

        res.redirect('/profile?success=1');
      } catch (err) {
        logger.error(err);
        res.status(500).send('Lỗi Server');
      }
    }
  ]
};

export default userController;
