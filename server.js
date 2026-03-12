import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';

// Import routers và middleware
import connectDB from './src/config/db.js';
import startCronJobs  from './src/utils/cron.js';
import authMiddleware from './src/middlewares/auth.middleware.js';
import indexRouter from './src/routers/index.router.js';
import authRouter from './src/routers/clients/auth.router.js';
import webeventRouter from './src/routers/clients/event.router.js';
import apieventRouter from './src/routers/api/event.api.js';
import myTicketsRouter from './src/routers/clients/my_ticket.router.js';
import profileRouter from './src/routers/clients/profile.router.js';
import apioderRouter from './src/routers/api/oder.api.js';
import weboderRouter from './src/routers/clients/order.router.js';
import paymentRouter from './src/routers/api/payment.api.js';

// import bookingRouter from './src/routers/clients/booking.router.js'; // uncomment khi cần

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();

// Middleware chung (đầu tiên)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));

// Auth middleware (toàn cục, phải ở đầu để attach req.user cho mọi request)
app.use(authMiddleware);                        

// Truyền req.user vào mọi Pug view (res.locals.user)
app.use((req, res, next) => {
  res.locals.user = req.user || null; 
  next();
});

// Cấu hình Pug
app.set('views', path.join(process.cwd(), 'src/views'));
app.set('view engine', 'pug');


app.use('/', authRouter);        
app.use('/', indexRouter);    
app.use('/events', webeventRouter); 
app.use('/api/events', apieventRouter);
app.use('/profile', profileRouter); 
app.use('/my-tickets', myTicketsRouter);
app.use('/api/orders', apioderRouter);
app.use('/oder' , weboderRouter);
app.use('/api/payment', paymentRouter);

// app.use('/booking', bookingRouter);

app.get('/', async (req, res) => {
  const Event = (await import('./src/models/event.models.js')).default;
  const events = await Event.find().sort({ date: 1 }).limit(10).lean();

  res.render('clients/page/home/index', {
    pageTitle: 'Trang chủ - EventVé',
    events,
    user: req.user || null 
  });
});

app.use('register', (req, res) => {
  res.render('clients/page/auth/register', {
    pageTitle: 'Đăng ký - EventVé',
    user: req.user || null,
    errors: [],
    oldInput: {}
  });
});

app.use('/login', (req, res) => {
  res.render('clients/page/auth/login', {
    pageTitle: 'Đăng nhập - EventVé',
    user: req.user || null,
    errors: [],       
    oldInput: {}         
  });
});

app.use('/events/', async (req, res, next) => {
  
  res.render('clients/page/events/index', {
    pageTitle: 'Sự kiện - EventVé',
    user: req.user || null 
  });

});

app.get('/profile', authMiddleware, (req, res) => {
  if (!req.user) return res.redirect('/login');

  res.render('clients/page/profile/index', {
    pageTitle: 'Hồ sơ cá nhân - EventVé',
    user: req.user
  });
});

app.get('/my-tickets', authMiddleware, (req, res) => {
  if (!req.user) return res.redirect('/login');   
  res.render('clients/page/my-tickets/index', {
    pageTitle: 'Vé của tôi - EventVé',
    user: req.user
  });
});

app.get ('/checkout' , authMiddleware , (req, res ) => {
  if (!req.user) return res.redirect('/login');   
  res.render('clients/page/oder/checkout', {
    pageTitle: 'Thanh toán - EventVé',
    user: req.user
  });
});


// Error handling (cuối cùng)
app.use((req, res) => {
  res.status(404).render('clients/page/error/404', {
    pageTitle: 'Không tìm thấy trang'
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).render('clients/page/error/500', {
    pageTitle: 'Lỗi máy chủ'
  });
});

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
