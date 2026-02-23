import express from 'express';
import connectDB from '../ticket_API/src/config/db.js';
import dotenv from 'dotenv';
import router from './src/routers/index.router.js';
import path from 'node:path';
dotenv.config();


connectDB();
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Welcome to the Ticket API');
});

app.get('/test', (req, res) => {
  res.render('client/pages/home/index', {
    pageTitle: 'Test Pug',
    events: []
  });
});

app.set('view engine', 'pug');
app.set('views', path.join(process.cwd(), 'src/views'));

app.use('/static', express.static('public'));

app.use(express.json());
app.use('/', router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});