
import express from "express";
import OrderController from "./../../controllers/order.controller.js";
import  authMiddleware  from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get('/checkout/:orderId', OrderController.renderCheckoutPage);
router.get('/payment/success', (req, res) => res.render('clients/success'));
router.get('/payment' , OrderController.getAllOrders);

export default router;
