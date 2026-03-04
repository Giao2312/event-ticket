import express from "express";
import authRouter from "./clients/auth.router.js";
import orderRouter from "./clients/order.router.js";
import ticketRouter from "./clients/ticket.router.js";
import homeRouter from "./clients/home.router.js";
import eventRouter from "./clients/event.router.js";


const router = express.Router();



router.use("/auth", authRouter);
router.use("/orders", orderRouter);
router.use("/", homeRouter);
router.use("/tickets", ticketRouter); 

router.use("/events", eventRouter);

export default router;
