// src/routers/index.js
import express from 'express';

// Web routers (render Pug)
import authWebRouter from './web/auth.router.js';
import homeWebRouter from './web/home.router.js';
import eventWebRouter from './web/event.router.js';
import profileWebRouter from './web/profile.router.js';
import myTicketsWebRouter from './web/my-ticket.router.js';

import orderWebRouter from './web/order.router.js';
import adminRouter from './web/admin.router.js';
import dashboardOrganizerRouter from './web/organizer.router.js';
// API routers (JSON)
import eventApiRouter from './api/event.api.js';
import orderApiRouter from './api/oder.api.js'; 
import paymentApiRouter from './api/payment.api.js';

export default (app) => {

  app.use('/', authWebRouter);    
  app.use('/', homeWebRouter);    
  app.use('/events', eventWebRouter);   
  app.use('/', profileWebRouter);
  app.use('/my-tickets', myTicketsWebRouter);
  app.use('/', orderWebRouter);          
  app.use('/', adminRouter); 
  app.use('/',dashboardOrganizerRouter);


  app.use('/api/events', eventApiRouter);
  app.use('/api/orders', orderApiRouter);
  app.use('/api/payment', paymentApiRouter);

  // Error handling (cuối cùng)
  app.use((req, res) => {
    res.status(404).render('clients/page/error/404', { pageTitle: 'Không tìm thấy trang' });
  });

  app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).render('clients/page/error/500', { pageTitle: 'Lỗi máy chủ' });
  });
};
