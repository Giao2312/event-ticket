import jwt from 'jsonwebtoken';
import User from '../models/user.models.js';

export const authMiddleware = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.clearCookie('token');
      res.clearCookie('refreshToken');
      return res.redirect('/login');
    }

    req.user = user;
    res.locals.user = user;
    next();
  } catch (err) {
    // Mã thông báo đã hết hạn, bị lỗi hoặc người dùng không còn tồn tại — hãy vô hiệu hóa cookie và tiếp tục
    // dưới dạng chưa được xác thực thay vì âm thầm xử lý như người dùng ẩn danh.
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    return res.redirect('/login');
  }
};

export const isAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
  }
  // Chuẩn hóa việc so sánh vai trò: coi 'admin' và 'Admin' là tương đương nhau
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập' });
  }
  next();
};

export const verifyToken = async (req, res) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.clearCookie('accessToken');
    res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};
