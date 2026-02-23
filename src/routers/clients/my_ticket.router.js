import express from "express";
import MyTicketsController from "../../controllers/clients/my_ticket.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/my-tickets", authMiddleware, MyTicketsController.index);
router.get("/my-tickets/:ticketId", authMiddleware, MyTicketsController.detail);

export default router;
