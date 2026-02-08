import Order from "../../models/order.models.js";

const orderHistoryController = {
  /**
   * GET /profile#transactions
   */
  async getOrderHistory(req, res) {
    try {
      const userId = req.user._id;

      const orders = await Order.find({ userId })
        .populate("eventId", "title")
        .sort({ createdAt: -1 })
        .lean();

      const transactions = orders.map(order => ({
        id: order._id,
        eventName: order.eventId?.title || "Sự kiện không tồn tại",
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        method: order.paymentMethod
      }));

      res.render("client/pages/user/profile", {
        pageTitle: "Quản lý tài khoản - Ticketbox",
        user: req.user,
        transactions,
        activeTab: "transactions"
      });

    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi tải lịch sử đơn hàng");
    }
  }
};

export default orderHistoryController;
