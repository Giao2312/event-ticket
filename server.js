// server.js (sau khi sửa)
import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';

import connectDB from './src/config/db.js';
import startCronJobs from './src/utils/cron.js';
import routerIndex from './src/routers/index.router.js';
import {globalViewVars} from './src/middlewares/view.middleware.js';
import { authMiddleware } from './src/middlewares/auth.middleware.js';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();

// Middleware chung
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authMiddleware);
// Static files
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));

// Auth middleware toàn cục
app.use(globalViewVars);


// Truyền user vào Pug
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  console.log('Truyền user vào Pug:', res.locals.user ? res.locals.user.name : 'null');
  next();
});

// Cấu hình Pug
app.set('views', path.join(process.cwd(), 'src/views'));
app.set('view engine', 'pug');

// Mount TẤT CẢ router (web + api)
routerIndex(app);

// Khởi động server
const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      startCronJobs();
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
