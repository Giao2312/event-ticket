import express from 'express';
import connectDB from '../ticket_API/src/config/db.js';
import dotenv from 'dotenv';
import router from './src/routers/index.router.js';
dotenv.config();


connectDB();
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Welcome to the Ticket API');
});

app.set('views', './src/Views/client/pages');
app.set('view engine', 'pug');

app.use('/static', express.static('public'));

app.use(express.json());
app.use('/', router);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});