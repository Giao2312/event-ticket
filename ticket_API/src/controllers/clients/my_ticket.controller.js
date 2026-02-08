import Ticket from "../../models/ticket.models.js";
import Order from "../../models/order.models.js";
import TicketType from "../../models/ticketType.models.js";
import Event from "../../models/event.models.js";
import Venue from "../../models/venue.models.js";

const MyTicketsController = {

  /**
   * GET /my-tickets
   * Danh sách vé của user
   */
  async index(req, res) {
    try {
      const userId = req.user._id;

      const tickets = await Ticket.find({ UserId: userId })
        .populate({
          path: "orderId",
          select: "status createdAt totalAmount"
        })
        .populate({
          path: "ticketTypeId",
          select: "title price",
          populate: {
            path: "eventId",
            select: "title date image venue",
            populate: {
              path: "venue",
              select: "title location"
            }
          }
        })
        .sort({ createdAt: -1 });

      return res.render("client/pages/user/my-tickets", {
        pageTitle: "Vé của tôi",
        tickets
      });

    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi server");
    }
  },

  /**
   * GET /my-tickets/:ticketId
   * Chi tiết 1 vé
   */
  async detail(req, res) {
    try {
      const userId = req.user._id;
      const { ticketId } = req.params;

      const ticket = await Ticket.findOne({
        _id: ticketId,
        UserId: userId
      })
        .populate({
          path: "ticketTypeId",
          populate: {
            path: "eventId",
            populate: { path: "venue" }
          }
        })
        .populate("orderId");

      if (!ticket) {
        return res.status(404).render("errors/404");
      }

      res.render("client/pages/user/ticket-detail", {
        pageTitle: "Chi tiết vé",
        ticket
      });

    } catch (error) {
      console.error(error);
      res.status(500).send("Lỗi server");
    }
  }

};

export default MyTicketsController;
