import express from "express";
import ticketController from "../../controllers/ticket.controllers.js";
import  {authMiddleware}   from "../../middlewares/auth.middleware.js";
import { roleMiddleware} from "../../middlewares/role.middleware.js";

const router = express.Router();

router.post(
  "/check-in",
  authMiddleware,
  roleMiddleware("admin"),
  ticketController.checkInByQRCode
);

export default router;

