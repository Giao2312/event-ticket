import User from '../models/user.model.js';
import Order from '../models/order.model.js';

const userController = {

  // [GET] /profile
  profile: async (req, res) => {
    try {
      const userId = req.user.id;

      // 1. Lấy thông tin user
      const user = await User.findById(userId).select('-password');

      // 2. Lấy lịch sử giao dịch của user
      const transactions = await Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(20);

      res.render('client/pages/user/profile', {
        pageTitle: 'Quản lý tài khoản - Ticketbox',
        user,
        transactions
      });

    } catch (error) {
      console.error(error);
      res.status(500).render('client/pages/error/500');
    }
  },

  // [POST] /profile/update
  updateProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, phone, dob, address } = req.body;

      // 1. Validate dữ liệu cơ bản
      if (!name || name.trim().length < 3) {
        return res.status(400).render('client/pages/user/profile', {
          error: 'Họ tên không hợp lệ'
        });
      }

      // 2. Cập nhật user
      await User.findByIdAndUpdate(userId, {
        name,
        phone,
        dob,
        address,
        updatedAt: new Date()
      });

      // 3. Redirect + flash message
      res.redirect('/profile?success=1');

    } catch (error) {
      console.error(error);
      res.status(500).send('Lỗi Server');
    }
  }
};

export default userController;
