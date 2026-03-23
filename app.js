
import express from 'express';
import cookieParser from 'cookie-parser';
import { authMiddleware } from './src/middlewares/auth.middleware.js'; 
import errorMiddleware from './src/middlewares/error.middleware.js';

import routes from './src/routers/index.router.js';

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(authMiddleware); 

app.set('view engine', 'pug');
app.set('views', './src/views');

app.use(express.static('public'));



routes(app); 

app.use(errorMiddleware);

