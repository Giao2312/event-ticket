import express from "express";
import { register, login, logout } from "../../controllers/auth.controller.js";
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Trang đăng nhập (GET) - không validation
router.get('/login', (req, res) => {
  res.render('clients/page/auth/login', {
    pageTitle: 'Đăng nhập - EventVé',
    user: req.user || null,
    errors: [],           // mảng rỗng ban đầu
    oldInput: {}          // để giữ giá trị cũ nếu cần
  });
});

// Trang đăng ký (GET) - không validation
router.get('/register', (req, res) => {
  res.render('clients/page/auth/register', {
    pageTitle: 'Đăng ký - EventVé',
    user: req.user || null,
    errors: [],
    oldInput: {}
  });
});

// API đăng ký (POST) - validation + trả JSON lỗi
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 3 }).withMessage('Tên phải ít nhất 3 ký tự'),
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải ít nhất 6 ký tự')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Trả JSON lỗi cho fetch JS xử lý (không render view)
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: errors.array()
      });
    }
    next();
  },
  register
);

// API đăng nhập (POST) - validation + trả JSON lỗi
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
    body('password').exists().withMessage('Mật khẩu bắt buộc')
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu không hợp lệ',
        errors: errors.array()
      });
    }
    next();
  },
  login
);





export default router;
