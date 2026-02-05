import express from "express";
import ticketController from "../../controllers/clients/ticket.controllers.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/role.middleware.js";

const router = express.Router();

// Check-in vé bằng QR
router.post(
  "/check-in",
  authMiddleware,
  authorize("admin"),
  ticketController.checkInByQRCode
);

export default router;

