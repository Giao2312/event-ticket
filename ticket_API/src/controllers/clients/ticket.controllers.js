// controllers/ticket.controller.js
import { body, validationResult } from 'express-validator';
import Ticket from '../../models/ticket.models.js';
import logger from '../../utils/logger.js';
import {roleMiddleware} from '../../middlewares/role.middleware.js'; 

const ticketController = {
  checkInByQRCode: [
    roleMiddleware(['admin', 'staff']),
    body('qrCode').exists().withMessage('Thiếu QR Code'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const { qrCode } = req.body;

        const ticket = await Ticket.findOne({ qrCode })
          .populate({
            path: 'ticketTypeId',
            populate: { path: 'eventId', model: 'Event' }
          })
          .populate('UserId', 'name email')
          .session(session);

        if (!ticket) throw new Error('Vé không tồn tại');

        if (ticket.isUsed) throw new Error('Vé đã sử dụng');

        ticket.isUsed = true;
        ticket.usedAt = new Date();
        await ticket.save({ session });

        await session.commitTransaction();

        res.json({
          message: 'Check-in thành công',
          ticket: {
            id: ticket._id,
            event: ticket.ticketTypeId.eventId.title,
            ticketType: ticket.ticketTypeId.title,
            user: ticket.UserId.name,
            usedAt: ticket.usedAt
          }
        });
      } catch (err) {
        await session.abortTransaction();
        logger.error(err);
        res.status(400).json({ message: err.message });
      } finally {
        session.endSession();
      }
    }
  ]
};

export default ticketController;
