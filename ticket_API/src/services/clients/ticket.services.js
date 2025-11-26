import Ticket from "../../models/ticket.models.js";
import { generateQR } from "../../utils/generateQR.js";

class TicketService {
    static async createTicket(order, ticketTypeId){

      const qrplayload = {
        orderId: order._id,
        userId: order.userId,
        TicketTypeId:  ticketTypeId,
        timestamp : Date.now()
      };

      // Tạo QR code từ payload
      const qrcode = await generateQR(qrplayload);

      //lưu vé vào db
      const ticket = await Ticket.create({
        orderId: order._id,
        ticketTypeId: ticketTypeId,
        qrCode: qrcode
      });
      return ticket;
    }

    // Lấy vé theo orderId
    static async getTicketsByOrderId(orderId){
      return await Ticket.find({ orderId });
    }
}

export default new TicketService();
