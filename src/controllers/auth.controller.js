import { body, validationResult } from 'express-validator';
import User from '../models/user.models.js';
import { signToken, signRefreshToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';

export const register = [
  body('name').trim().isLength({ min: 3 }).withMessage('Tên không hợp lệ'),
  body('email')
    .isEmail({ require_tld: false })
    .normalizeEmail()
    .custom((value) => {
      const isNormalEmail = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value);
      const isTestEmail = value.toLowerCase().endsWith('@demo');
      if (isNormalEmail || isTestEmail) return true;
      throw new Error('Email không đúng định dạng hoặc đuôi @demo');
    }),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu >= 6 ký tự'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { name, email, password } = req.body;
      const normalizedEmail = email.toLowerCase();

      const exists = await User.findOne({ email: normalizedEmail });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
      }

      // Gán plain password, model pre-save sẽ hash đúng 1 lần
      const user = new User({
        name,
        email: normalizedEmail,
        password
      });

      const savedUser = await user.save();

      const token = signToken({ id: savedUser._id, role: savedUser.role });
      const refreshToken = signRefreshToken({ id: savedUser._id });

      // ============================================================
      // BẢO MẬT: Set token vào HTTP-Only Cookie thay vì JSON body
      // JavaScript phía client KHÔNG THỂ đọc được token
      // Điều này ngăn chặn XSS attack đánh cắp token
      // ============================================================
      res.cookie('token', token, {
        httpOnly: true,     // JS không đọc được - ngăn XSS
        sameSite: 'Strict', // Ngăn CSRF attack
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Trả thông tin user mà KHÔNG trả token trong body
      // Token chỉ tồn tại trong HTTP-Only Cookie
      return res.status(201).json({
        success: true,
        message: 'Đăng ký thành công',
        user: {
          id: savedUser._id,
          name: savedUser.name,
          email: savedUser.email
        }
      });
    } catch (err) {
      logger.error('Lỗi đăng ký:', err);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lưu user' });
    }
  }
];

export const login = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
    }

    try {
      const { email, password } = req.body;
      const genericError = { success: false, message: 'Email hoặc mật khẩu không đúng' };
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return res.status(400).json(genericError);
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(400).json(genericError);
      }

      const token = signToken({
        id: user._id,
        role: user.role
      });

      // ============================================================
      // BẢO MẬT: Set token vào HTTP-Only Cookie
      // - httpOnly: true → JavaScript không thể đọc token
      //   → Ngăn chặn XSS (Cross-Site Scripting) đánh cắp token
      // - sameSite: 'Strict' → Cookie chỉ được gửi trong same-site requests
      //   → Ngăn chặn CSRF (Cross-Site Request Forgery)
      // - secure: true → Chỉ gửi qua HTTPS (production)
      // ============================================================
      res.cookie('token', token, {
        httpOnly: true,     // JavaScript cannot read this cookie
        sameSite: 'Strict', // CSRF protection - only send on same-site requests
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // KHÔNG trả token trong JSON body
      // Token chỉ tồn tại trong HTTP-Only Cookie
      // Browser sẽ tự động gửi cookie này trong các request tiếp theo
      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
    } catch (err) {
      logger.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
];

export const logout = async (req, res) => {
  try {
    // Xóa token cookie
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    return res.status(200).json({ success: true, message: 'Đăng xuất thành công' });
  } catch (err) {
    logger.error('Logout error:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
