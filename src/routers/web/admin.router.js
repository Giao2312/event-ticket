import express from 'express';
import AdminController from '../../controllers/admin.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import roleMiddleware from '../../middlewares/role.middleware.js';
import { upload } from '../../middlewares/upload.middlewares.js';
import User from '../../models/user.models.js';

const router = express.Router();

router.get(
  '/admin',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.getDashboard
);

router.get(
  '/admin/dashboard',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.getDashboard
);

router.get(
  '/admin/dashboard/events',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.manageEvents
);

router.get(
  '/admin/dashboard/events/create',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    const organizers = await User.find({ role: 'Organizer' }).select('_id name email').lean();
    res.render('organizer/dashboard/events/create', {
      pageTitle: 'Admin tạo sự kiện',
      user: req.user,
      organizers,
      isAdminCreatingForOrganizer: true
    });
  }
);

router.post(
  '/admin/dashboard/events/create',
  authMiddleware,
  roleMiddleware('admin'),
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'galleryImages', maxCount: 5 }
  ]),
  AdminController.createEventByAdmin
);

router.get(
  '/admin/dashboard/events/:eventId',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.manageEventDetail
);

router.get(
  '/admin/dashboard/orders',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.manageOrders
);

router.get(
  '/admin/dashboard/users',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.manageUsers
);

router.post(
  '/admin/events/:eventId/approve',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.approveEvent
);

router.post(
  '/admin/events/:eventId/reject',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.rejectEvent
);

router.delete(
  '/admin/events/:eventId',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.deleteEvent
);

router.post(
  '/admin/events/:eventId/notify-organizer',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.notifyOrganizerAboutEvent
);

router.patch(
  '/admin/users/:userId/toggle-status',
  authMiddleware,
  roleMiddleware('admin'),
  AdminController.toggleUserStatus
);

export default router;
