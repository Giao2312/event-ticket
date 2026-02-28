import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import connectDB from './src/config/db.js';
import router from './src/routers/index.router.js'; 

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());         
app.use(express.urlencoded({ extended: true })); 


app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/static', express.static(path.join(__dirname, 'public'))); 


app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'src/views'));


app.use('/', router);

app.get('/test', (req, res) => {
  res.render('clients/page/home/index', {
    pageTitle: 'Test Pug',
    events: [] 
  });
});


app.use((req, res, next) => {
  res.status(404).render('clients/page/error/404', { 
    pageTitle: 'Không tìm thấy trang',
    message: 'Trang bạn yêu cầu không tồn tại.'
  });
});


app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).render('clients/page/error/500', { 
    pageTitle: 'Lỗi máy chủ',
    message: 'Có lỗi xảy ra từ phía server. Vui lòng thử lại sau.'
  });
});


const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();