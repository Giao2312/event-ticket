import express from 'express';
import DashboardController from '../../controllers/dashboard.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import roleMiddleware from '../../middlewares/role.middleware.js';

const router = express.Router();

// Ví dụ API endpoint cho dashboard (sẽ mở rộng sau)
router.get('/organizer/stats', 
  authMiddleware, 
  roleMiddleware('Organizer'), 
  async (req, res) => {
    // Trả JSON stats để dùng cho frontend động nếu cần
    res.json({ success: true, message: 'API stats organizer' });
  }
);

export default router;
