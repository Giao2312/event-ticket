import express from "express";
import authRouter from "./clients/auth.router.js";
import orderRouter from "./clients/order.router.js";
import ticketRouter from "./clients/ticket.router.js";

const router = express.Router();
router.use("/auth", authRouter);
router.use("/orders", orderRouter);
router.use("/tickets", ticketRouter); 
export default router;