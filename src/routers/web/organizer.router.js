import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import roleMiddleware from "../../middlewares/role.middleware.js";
import OrganizerOrderController from "../../controllers/Organizer.controller.js";
import OrderController from "../../controllers/order.controller.js";
import { upload } from "../../middlewares/upload.middlewares.js";

const router = express.Router();

const createEventUpload = upload.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "galleryImages", maxCount: 5 },
  { name: "venueProofImage", maxCount: 1 },
  { name: "onlineProofImage", maxCount: 1 }
]);

// API / views cho organizer
router.get(
  "/organizer/orders",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getOrders
);

router.get(
  "/organizer/dashboard",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getDashboard
);

router.get(
  "/organizer/events",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getEventsPage
);

router.get(
  "/organizer/create-event",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getCreateEventPage
);

router.post(
  "/organizer/create-event",
  authMiddleware,
  roleMiddleware("Organizer"),
  (req, res, next) => {
    createEventUpload(req, res, (err) => {
      if (err) {
        return OrganizerOrderController.handleCreateEventUploadError(err, req, res, next);
      }

      return next();
    });
  },
  OrganizerOrderController.createEvent
);

// Lịch sử đơn hàng cá nhân (người mua hoặc organizer xem)
router.get(
  "/my-orders",
  authMiddleware,
  OrderController.getOrderHistory
);

router.post("/checkout", authMiddleware, OrderController.createOrder);

// Withdrawal routes
router.get(
  "/organizer/finance",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getFinancialOverview
);

router.get(
  "/organizer/withdrawals",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.getWithdrawalHistory
);

router.post(
  "/organizer/withdrawals/request",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.requestWithdrawal
);

router.patch(
  "/organizer/bank-info",
  authMiddleware,
  roleMiddleware("Organizer"),
  OrganizerOrderController.updateBankInfo
);

export default router;
