import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Ticket from '../models/ticket.models.js';
import { roleMiddleware } from '../middlewares/role.middleware.js';
import logger from '../utils/logger.js';
import { hashTicketQR, verifyTicketQR } from '../utils/ticketQR.js';

const buildTicketQueriesFromQRCode = (qrCode) => {
  const normalizedQRCode = String(qrCode || '').trim();

  if (normalizedQRCode.startsWith('eyJ')) {
    const decoded = verifyTicketQR(normalizedQRCode);
    const qrTokenHash = hashTicketQR(normalizedQRCode);
    const hashedTokenQuery = { qrTokenHash };

    if (decoded.jti) {
      hashedTokenQuery.qrJti = decoded.jti;
    }

    return {
      decoded,
      isJwtQr: true,
      lookupQuery: { _id: decoded.ticketId },
      qrTokenHash,
      updateQuery: {
        _id: decoded.ticketId,
        event: decoded.eventId,
        status: 'paid',
        usedAt: null,
        $or: [
          hashedTokenQuery,
          { qrToken: normalizedQRCode }
        ]
      }
    };
  }

  return {
    decoded: null,
    isJwtQr: false,
    lookupQuery: { qrCode: normalizedQRCode },
    qrTokenHash: null,
    updateQuery: {
      qrCode: normalizedQRCode,
      status: 'paid',
      usedAt: null
    }
  };
};

const ticketController = {
  checkInByQRCode: [
    roleMiddleware('admin', 'staff'),
    body('qrCode')
      .isString()
      .withMessage('QR Code khong hop le')
      .trim()
      .notEmpty()
      .withMessage('Thieu QR Code'),

    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const { qrCode } = req.body;
        let decoded = null;
        let isJwtQr = false;
        let lookupQuery = {};
        let qrTokenHash = null;
        let updateQuery = {};

        try {
          ({
            decoded,
            isJwtQr,
            lookupQuery,
            qrTokenHash,
            updateQuery
          } = buildTicketQueriesFromQRCode(qrCode));
        } catch (err) {
          throw new Error(`Xac thuc QR that bai: ${err.message}`);
        }

        const result = await Ticket.updateOne(
          updateQuery,
          {
            $set: {
              usedAt: new Date()
            }
          }
        ).session(session);

        if (result.matchedCount === 0) {
          const existingTicket = await Ticket.findOne(lookupQuery).session(session);

          if (!existingTicket) {
            throw new Error('Ve khong ton tai');
          }

          if (existingTicket.status !== 'paid') {
            throw new Error('Ve khong hop le hoac da bi huy');
          }

          if (existingTicket.usedAt) {
            throw new Error(`Ve da duoc check-in luc ${existingTicket.usedAt.toLocaleString('vi-VN')}`);
          }

          if (isJwtQr) {
            if (decoded?.eventId && existingTicket.event?.toString() !== decoded.eventId) {
              throw new Error('QR code khong khop voi su kien cua ve');
            }

            const hasLegacyRawToken = Boolean(existingTicket.qrToken);
            const hasHashedToken = Boolean(existingTicket.qrTokenHash);
            const hashMismatch = hasHashedToken && existingTicket.qrTokenHash !== qrTokenHash;
            const jtiMismatch = Boolean(existingTicket.qrJti && decoded?.jti && existingTicket.qrJti !== decoded.jti);
            const rawTokenMismatch = hasLegacyRawToken && existingTicket.qrToken !== String(qrCode || '').trim();

            if (hashMismatch || jtiMismatch || rawTokenMismatch) {
              throw new Error('QR code da bi thay the hoac khong con hieu luc');
            }
          }

          throw new Error('Ve khong hop le');
        }

        const ticket = await Ticket.findOne(lookupQuery)
          .populate('event', 'name date location')
          .populate('user', 'name email')
          .session(session);

        await session.commitTransaction();

        return res.json({
          message: 'Check-in thanh cong',
          ticket: {
            id: ticket._id,
            event: ticket.event?.name,
            eventDate: ticket.event?.date,
            location: ticket.event?.location,
            ticketType: ticket.ticketType,
            user: ticket.user?.name,
            email: ticket.user?.email,
            usedAt: ticket.usedAt
          }
        });
      } catch (err) {
        await session.abortTransaction();
        logger.error('Check-in error:', err);
        return res.status(400).json({ message: err.message });
      } finally {
        session.endSession();
      }
    }
  ]
};

export default ticketController;
