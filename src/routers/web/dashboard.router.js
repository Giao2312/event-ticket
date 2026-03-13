import express from 'express';
import DashboardController from '../../controllers/dashboard.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import roleMiddleware from '../../middlewares/role.middleware.js';

const router = express.Router();

// Trang dashboard cho Organizer (nhà tổ chức)
router.get('/organizer', 
  authMiddleware, 
  roleMiddleware('Organizer'), 
  DashboardController.organizerDashboard
);

// Trang dashboard cho Admin
router.get('/admin', 
  authMiddleware, 
  roleMiddleware('admin'), 
  DashboardController.adminDashboard
);
router.get ('/admin/dashboard/events',authMiddleware, roleMiddleware('admin'), (req, res) => {
  res.render('admin/dashboard/events', { pageTitle: 'Admin Quản lý sự kiện' });
});

router.get('/admin/dashboard', async (req, res) => {
  try {
    const stats = await getDashboardStats(req.user.id); // your logic
    const recentEvents = await recentEvents(req.user.id);
    // ...

    res.render('admin/dashboard/index', {
      user: req.user,
      stats: stats || { totalEvents: 0, totalTicketsSold: 0, totalOrders: 0, totalRevenue: 0, fillRate: 0 },
      recentEvents: recentEvents || [],
      topTickets: topTickets || [],
      monthlyRevenue: monthlyRevenue || [],
      monthlyOrders: monthlyOrders || [],
    });
  } catch (err) {
    console.error(err);
    // fallback render with empty data
    res.render('admin/dashboard/index', {
      user: req.user,
      stats: { totalEvents: 0, totalTicketsSold: 0, totalOrders: 0, totalRevenue: 0, fillRate: 0 },
      recentEvents: [],
      topTickets: [],
      monthlyRevenue: [],
      monthlyOrders: [],
    });
  }
});

router.get('/organizer/events', authMiddleware, roleMiddleware('Organizer'), (req, res) => {
  res.render('organizer/dashboard/events/index', { pageTitle: 'Quản lý sự kiện' });
});

router.post('/organizer/create', authMiddleware, roleMiddleware('Organizer'), (req, res) => {
  res.render('organizer/dashboard/events/create', { pageTitle: 'Tạo sự kiện' });
});

router.get('/organizer/orders', authMiddleware, roleMiddleware('Organizer'), (req, res) => {
  res.render('organizer/dashboard/orders/index', { pageTitle: 'Quản lý đơn hàng' });
});



export default router;
