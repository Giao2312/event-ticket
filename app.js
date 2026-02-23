import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import router from './routes/index.router.js';

dotenv.config();

const app = express();

// Connect DB
connectDB();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static
app.use('/bootstrap', express.static('node_modules/bootstrap/dist'));
app.use(express.static('public'));

// View engine
app.set('view engine', 'pug');
app.set('views', './views');

// Routes
router(app);

export default app;
