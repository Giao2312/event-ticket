import express from 'express';
import dotenv from 'dotenv';
import jwt, { decode } from 'jsonwebtoken'; // BẮT BUỘC THÊM DÒNG NÀY
import cookieParser from 'cookie-parser';
import connectDB from './src/config/db.js';
import apiRouter from './src/routers/api/index.router.js';
import clientRouter from './src/routers/index.router.js';
import errorMiddleware from './src/middlewares/error.middleware.js';
// import {authMiddleware} from './src/middlewares/auth.middleware.js';
import {verifyToken} from './src/utils/jwt.js'
dotenv.config();

const app = express();
connectDB();

// 1. Cấu hình Body Parser & Cookie Parser (NÊN ĐỂ LÊN ĐẦU)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// app.use(authMiddleware);
app.use(cookieParser());

// 2. Middleware xác thực User (GỘP CHUNG VÀO MỘT)
app.use((req, res, next) => {
    const token = req.cookies.token; // Tên này PHẢI khớp với tên bạn set trong res.cookie ở login controller
    res.locals.user = null;
    
    if (token) {
        try {
            // Sử dụng hàm verifyToken từ utils/jwt.js
            const decoded = verifyToken(token); 
            res.locals.user = decoded; // Nếu decode thành công, user sẽ có dữ liệu
            
        } catch (err) {
           
            console.error("Lỗi giải mã token:", err.message);
        }
    }
      console.log(res.locals.user);
    next();
});

// 3. Cấu hình View
app.set('view engine', 'pug');
app.set('views', './src/views');

// 4. Static files
app.use('/bootstrap', express.static('node_modules/bootstrap/dist'));
app.use(express.static('public'));

// 5. Đăng ký Router
app.use('/api', apiRouter);
app.use('/', clientRouter);

// 6. Error Middleware (PHẢI NẰM CUỐI CÙNG)
app.use(errorMiddleware);

export default app;
