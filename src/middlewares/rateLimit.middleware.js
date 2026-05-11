import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import logger from '../utils/logger.js';

// ============================================================
// RATE LIMITING - Ngăn chặn Brute Force và DoS Attack
//
// Tấn công Brute Force: Kẻ tấn công gửi hàng ngàn request
// để dò password hoặc flood server
//
// Rate Limiting giới hạn số request từ 1 IP trong khoảng thời gian
// ============================================================

// Giới hạn đăng nhập: 5 lần thất bại trong 15 phút
// Sau đó bị khóa مؤقت 15 phút
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // 5 lần request
  message: {
    success: false,
    message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.'
  },
  standardHeaders: true, // Trả về header RateLimit-*
  legacyHeaders: false,
  // Ghi log khi có người bị block
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} - Login attempt`);
    res.status(options.statusCode).json(options.message);
  },
  // Chỉ đếm IP đăng nhập thất bại, không count request thành công
  skipSuccessfulRequests: false
});

// Giới hạn đăng ký: 10 lần trong 1 giờ mỗi IP
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 10,
  message: {
    success: false,
    message: 'Quá nhiều lần đăng ký. Vui lòng thử lại sau 1 giờ.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} - Registration attempt`);
    res.status(options.statusCode).json(options.message);
  }
});

// Giới hạn API chung: 100 request mỗi phút
// Áp dụng cho tất cả endpoints không thuộc auth
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 100,
  message: {
    success: false,
    message: 'Quá nhiều request. Vui lòng thử lại sau.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Bỏ qua các endpoint auth
  skip: (req) => {
    const skipPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'];
    return skipPaths.includes(req.path);
  }
});

// Giới hạn tạo đơn hàng: 10 đơn/phút mỗi user
// Ngăn chặn việc flood tạo đơn hàng giả
export const createOrderRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 10,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu tạo đơn. Vui lòng thử lại sau.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Đếm theo user ID nếu đăng nhập, không thì đếm theo IP (dùng ipKeyGenerator cho IPv6)
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req);
  }
});

// Giới hạn thanh toán: 5 lần/phút mỗi user
// Ngăn spam request thanh toán
export const paymentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 5,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu thanh toán. Vui lòng thử lại sau.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || ipKeyGenerator(req);
  }
});
