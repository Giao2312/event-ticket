import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import User from '../../models/user.models.js';
import { signToken } from '../../utils/jwt.js';
import logger from '../../utils/logger.js';

const authController = {
  register: [
    body('name').trim().isLength({ min: 3 }).withMessage('Tên không hợp lệ'),
    body('email').isEmail().withMessage('Email không hợp lệ'),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu >=6 ký tự'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      try {
        const { name, email, password } = req.body;

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: 'Email đã tồn tại' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({ name, email, password: hashedPassword });

        const token = signToken({ id: user._id, role: user.role });

        res.status(201).json({
          message: 'Đăng ký thành công',
          token,
          user: { id: user._id, name, email }
        });
      } catch (err) {
        logger.error(err);
        res.status(500).json({ message: 'Server error' });
      }
    }
  ],

  // login: [
  //   body('email').isEmail().withMessage('Email không hợp lệ'),
  //   body('password').exists().withMessage('Mật khẩu bắt buộc'),

  //   async (req, res) => {
  //     const errors = validationResult(req);
  //     if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  //     try {
  //       const { email, password } = req.body;

  //       const user = await User.findOne({ email });
  //       if (!user || !(await user.comparePassword(password))) {
  //         return res.status(400).json({ message: 'Email hoặc mật khẩu sai' });
  //       }

  //       const token = signToken({ id: user._id, role: user.role });

  //       res.json({
  //         message: 'Đăng nhập thành công',
  //         token,
  //         user: { id: user._id, name: user.name, email, role: user.role }
  //       });
  //     } catch (err) {
  //       logger.error(err);
  //       res.status(500).json({ message: 'Server error' });
  //     }
  //   }
  // ],
login: async (req, res) => {
  console.log('Body nhận được:', req.body); // Kiểm tra body có email/password không

  const { email, password } = req.body;
  console.log('Email input:', email);
  console.log('Password input:', password);

  if (!email || !password) {
    return res.status(400).json({ message: 'Thiếu email hoặc password' });
  }

  try {
    const user = await User.findOne({ email });
    console.log('User tìm thấy:', user ? user.email : 'Không tìm thấy');

    if (!user) {
      return res.status(400).json({ message: 'Email không tồn tại' });
    }

    const isMatch = await user.comparePassword(password);
    console.log('Password khớp:', isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu sai' });
    }

    // ... phần còn lại
  } catch (err) {
    console.error('Lỗi login:', err);
    res.status(500).json({ message: 'Server error' });
  }
},
  logout: (req, res) => {
    res.json({ message: 'Đăng xuất thành công' });
  }
};

export default authController;
