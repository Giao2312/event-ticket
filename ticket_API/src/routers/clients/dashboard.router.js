import express from 'express;'
import DashboardController from '../../controllers/dashboard.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/user', authMiddleware, DashboardController.userDashboard);
router.get('/admin', authMiddleware, DashboardController.adminDashboard);

export default router;
