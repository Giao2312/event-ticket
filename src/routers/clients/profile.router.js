import express from "express";
import orderHistoryController from "../../controllers/clients/orderhistory.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get(
  "/profile",
  authenticate,
  orderHistoryController.getOrderHistory
);

export default router;
