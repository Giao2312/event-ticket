// controllers/clients/auth.controller.js
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import User from '../models/user.models.js';
import { signToken, signRefreshToken } from '../utils/jwt.js'; 
import logger from '../utils/logger.js';

// Export từng function riêng (named export)
export const register = [
  body('name').trim().isLength({ min: 3 }).withMessage('Tên không hợp lệ'),
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu >=6 ký tự'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, email, password } = req.body;

      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(400).json({ message: 'Email đã tồn tại' });

      const hashedPassword = await bcrypt.hash(password, 10);
      logger.info(`Hashed password for ${email}: ${hashedPassword}`);

      const user = await User.create({ name, email: email.toLowerCase(), password: hashedPassword });

      const token = signToken({ id: user._id, role: user.role });
      const refreshToken = signRefreshToken({ id: user._id });

      res.status(201).json({
        message: 'Đăng ký thành công',
        token,
        refreshToken,
        user: { id: user._id, name, email }
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
];

export const login = [
  body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').exists().withMessage('Mật khẩu bắt buộc'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(400).json({ message: 'Email không tồn tại' });

      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(400).json({ message: 'Mật khẩu sai' });

      const token = signToken({ id: user._id, role: user.role });
      const refreshToken = signRefreshToken({ id: user._id });

      res.json({
        message: 'Đăng nhập thành công',
        token,
        refreshToken,
        user: { id: user._id, name: user.name, email, role: user.role }
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
];

export const logout = (req, res) => {
  res.json({ message: 'Đăng xuất thành công' });
};
