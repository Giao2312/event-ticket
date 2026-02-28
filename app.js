import express from 'express';
import dotenv from 'dotenv';
import connectDB from './src/config/db.js';
import router from './src/routers/index.router.js';

dotenv.config();

const app = express();


connectDB();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use('/bootstrap', express.static('node_modules/bootstrap/dist'));
app.use(express.static('public'));

app.use('/api', router);
app.use('/', clientRoutes); 

app.set('view engine', 'pug');
app.set('views', './views');


router(app);


export default app;
