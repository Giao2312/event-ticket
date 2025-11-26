import ticketServices from "../../services/clients/ticket.services";
import orderServices from "../../services/clients/order.services.js";

class TicketController {

    // Hiển thị vé sau khi mua thành công
    async showTickets(req, res) {
      try {
        const orderId = req.params.orderId;

        const order = await orderServices.getOrderById(orderId);
        if(!order) return res.status(404).send('Không tìm thấy đơn hàng');

        const tickets = await ticketServices.getTicketsByOrderId(orderId);

        res.render('clients/tickets/tickets', {
          title: 'Vé của tôi',
          order,
          tickets
        });
      } catch (error) {
        console.error('Error fetching tickets:', error);
        return res.status(500).send('Lỗi máy chủ, vui lòng thử lại sau');
      }
    }
    
}

export default new TicketController();
