import express from "express";
import { register, login, logout } from "../../controllers/auth.controller.js";
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Trang đăng nhập (GET) - không validation
router.get('/login', (req, res) => {

  console.log('Render trang chủ với user:', req.user ? req.user.name : 'null');
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


router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);



export default router;

