import jwt from "jsonwebtoken";
import User from "../models/user.models.js";
import logger from "../utils/logger.js";
import errorMiddleware from "./error.middleware.js"; 

// Trong src/middlewares/auth.middleware.js
export const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    // ƯU TIÊN cookie trước (browser tự gửi)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } 
    // Sau đó mới fallback sang header Authorization
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split('Bearer ')[1];
    }

    if (!token) {
      console.log('Không tìm thấy token trong request');
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      console.log('User không tồn tại cho token này');
      return next();
    }

    req.user = user;
    // console.log('Auth success - user attached:', user.name || user.email);
    // console.log('Token từ cookie:', req.cookies?.token ? 'Có' : 'Không');
    // console.log('Token từ header:', req.headers.authorization ? 'Có' : 'Không');
  } catch (err) {
    console.error('Auth middleware error:', err.message);
  }

  next();
};

// Sửa lại cách gọi lỗi trong isAdmin
export const isAdmin = async (req, res, next) => {
    if (!req.user) {
        return next(new errorMiddleware.AuthFailureError("Bạn cần đăng nhập"));
    }
    if (req.user.role !== 'admin' && req.user.isAdmin !== true) {
        return next(new errorMiddleware.ForbiddenError("Bạn không có quyền truy cập"));
    }
    next();
};

export const verifyToken = async (req, res) => {
    try {
        // Lấy token từ cookie
        const token = req.cookies.accessToken;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Lấy thông tin user từ DB (không bao gồm mật khẩu)
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        // Trả về thông tin user
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
        // Nếu token hết hạn hoặc sai định dạng
        res.clearCookie('accessToken');
        res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
};

