import Event from '../models/event.models.js';
import Order from '../models/order.models.js';
import User from '../models/user.model.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const AdminController = {
  // Trang Dashboard chính của Admin
  getDashboard: [
    roleMiddleware('admin'), // Bắt buộc kiểm tra role
    async (req, res) => {
      try {
        // Lấy tất cả dữ liệu hệ thống song song
        const [
          totalEvents,
          totalUsers,
          totalRevenueData,
          recentOrders
        ] = await Promise.all([
          Event.countDocuments({}),
          User.countDocuments({}),
          Order.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]),
          Order.find({}).sort({ createdAt: -1 }).limit(5).populate('userId', 'name')
        ]);

        res.render('admin/dashboard/index', {
          pageTitle: 'Dashboard Quản trị',
          stats: {
            totalEvents,
            totalUsers,
            totalRevenue: totalRevenueData[0]?.total || 0
          },
          recentOrders,
          user: req.user
        });
      } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send('Lỗi tải dữ liệu hệ thống');
      }
    }
  ],

  // Quản lý sự kiện: Admin xem tất cả, không lọc theo user
  manageEvents: [
    roleMiddleware('admin'),
    async (req, res) => {
      try {
        const events = await Event.find({}).sort({ createdAt: -1 });
        res.render('admin/dashboard/events', { 
          pageTitle: 'Quản lý sự kiện toàn hệ thống',
          events 
        });
      } catch (err) {
        res.status(500).send('Lỗi tải danh sách sự kiện');
      }
    }
  ]
};

export default AdminController;
