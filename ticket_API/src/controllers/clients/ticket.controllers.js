import Ticket from "../../models/ticket.models.js";
import TicketType from "../../models/ticketType.models.js";
import Event from "../../models/event.models.js";

const ticketController = {

  /**
   * CHECK-IN VÉ BẰNG QR
   * Quyền: admin / staff
   */
  checkInByQRCode: async (req, res) => {
    try {
      const { qrCode } = req.body;

      if (!qrCode) {
        return res.status(400).json({
          message: "Thiếu dữ liệu QR Code"
        });
      }

      // 1. Tìm vé theo QR
      const ticket = await Ticket.findOne({ qrCode })
        .populate({
          path: "ticketTypeId",
          populate: {
            path: "eventId",
            model: "Event"
          }
        })
        .populate("UserId", "name email");

      if (!ticket) {
        return res.status(404).json({
          message: "Vé không tồn tại"
        });
      }

      // 2. Kiểm tra vé đã sử dụng chưa
      if (ticket.isUsed) {
        return res.status(400).json({
          message: "Vé đã được sử dụng",
          usedAt: ticket.usedAt
        });
      }

      // 3. Đánh dấu vé đã sử dụng
      ticket.isUsed = true;
      ticket.usedAt = new Date();
      await ticket.save();

      // 4. Trả kết quả thành công
      res.json({
        message: "Check-in thành công",
        ticket: {
          id: ticket._id,
          event: ticket.ticketTypeId.eventId.title,
          ticketType: ticket.ticketTypeId.title,
          user: ticket.UserId.name,
          usedAt: ticket.usedAt
        }
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Lỗi server khi check-in vé"
      });
    }
  }

};

export default ticketController;
