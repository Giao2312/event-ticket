
import express from "express";
import OrderController from "./../../controllers/order.controller.js";
import  {authMiddleware}  from "../../middlewares/auth.middleware.js";

const app = express();

const router = express.Router();
app.get('/checkout', authMiddleware, async (req, res) => {
  const { orderId } = req.query;

  if (!orderId) return res.redirect('/my-tickets');

  try {
    const order = await Order.findOne({ _id: orderId, userId: req.user.id })
      .populate('eventId', 'name image date time location') // Populate event
      .lean();

    if (!order) {
      return res.status(404).render('clients/page/error/404', { pageTitle: 'Không tìm thấy đơn hàng' });
    }

    const holdUntil = new Date(order.holdUntil);
    const timeLeft = Math.max(0, Math.floor((holdUntil - new Date()) / 1000)); 

    res.render('clients/page/oder/checkout', {
      pageTitle: 'Thanh toán - EventVé',
      order,
      event: order.eventId, // Truyền object event đã populate
      timeLeft,             // Thời gian countdown (giây)
      user: req.user
    });
  } catch (err) {
    console.error('Lỗi render checkout:', err);
    res.status(500).render('clients/page/error/500');
  }
});


router.get('/checkout/:orderId', OrderController.renderCheckoutPage);

router.get('/payment/success', (req, res) => res.render('clients/success'));
router.get('/payment' , OrderController.getAllOrders);

export default router;
