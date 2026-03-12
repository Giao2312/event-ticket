import express from "express";
import authRouter from "./clients/auth.router.js";
import orderRouter from "./clients/order.router.js";
import ticketRouter from "./clients/ticket.router.js";
import homeRouter from "./clients/home.router.js";
import eventRouter from "./clients/event.router.js";
import myTicketsRouter from "./clients/my_ticket.router.js";  
import profileRouter from "./clients/profile.router.js";
import paymentRouter from "./api/payment.api.js";

import OrderController from '../controllers/order.controller.js';
import authMiddleware  from '../middlewares/auth.middleware.js';


const router = express.Router();



router.use("/auth", authRouter);
router.use("/orders", orderRouter);
router.use("/", homeRouter);
router.use("/tickets", ticketRouter); 
router.use("/my-tickets", myTicketsRouter);
router.use("/profile", profileRouter);
router.get('/checkout/:orderId', authMiddleware, OrderController.renderCheckoutPage);


router.use("/events", eventRouter);
router.use("/payment", paymentRouter);

export default router;
