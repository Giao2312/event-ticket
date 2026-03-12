import express from 'express';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import apiRouter from './src/routers/api/index.router.js'; // Giả sử file này chứa các API
import clientRouter from './src/routers/client/index.router.js'; // Chứa các trang giao diện (checkout, home, events)

dotenv.config();

const app = express();

connectDB();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Cấu hình View
app.set('view engine', 'pug');
app.set('views', './src/views'); // Lưu ý: đường dẫn views nên trỏ vào src/views

// Static files
app.use('/bootstrap', express.static('node_modules/bootstrap/dist'));
app.use(express.static('public'));

// Đăng ký Router
app.use('/api', apiRouter);      // Mọi API bắt đầu bằng /api/...
app.use('/', clientRouter);      // Mọi trang web (checkout, events, home)

export default app;
