import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';

const QR_SECRET = env.QR_SECRET || 'default-qr-secret-change-in-production';
const QR_ALGORITHM = 'HS256';

/**
 * Generate a revocable QR identifier for a ticket.
 */
export const generateTicketQRJti = () => crypto.randomUUID();

/**
 * Hash the raw QR token before persisting it to the database.
 */
export const hashTicketQR = (qrToken) => {
  if (!qrToken) {
    throw new Error('QR token is required');
  }

  return crypto.createHash('sha256').update(qrToken).digest('hex');
};

/**
 * Generate a signed JWT-based QR token for a ticket.
 * Token validity is determined by DB state and event timing, not by JWT expiry.
 */
export const generateTicketQR = (ticketData) => {
  const {
    ticketId,
    orderId,
    eventId,
    userId,
    ticketTypeId,
    index = 0,
    jti
  } = ticketData;

  if (!jti) {
    throw new Error('QR jti is required');
  }

  const payload = {
    tid: ticketId,
    oid: orderId,
    eid: eventId,
    uid: userId,
    type: ticketTypeId,
    i: index
  };

  return jwt.sign(payload, QR_SECRET, {
    algorithm: QR_ALGORITHM,
    jwtid: jti,
    noTimestamp: true
  });
};

/**
 * Create the current QR token artifact for a ticket.
 */
export const createTicketQRArtifact = (ticketData) => {
  const qrJti = ticketData.jti || generateTicketQRJti();
  const qrToken = generateTicketQR({
    ...ticketData,
    jti: qrJti
  });

  return {
    qrToken,
    qrTokenHash: hashTicketQR(qrToken),
    qrJti
  };
};

/**
 * Verify a ticket QR token
 * Returns decoded payload if valid, throws if invalid
 */
export const verifyTicketQR = (qrToken) => {
  if (!qrToken) {
    throw new Error('QR token is required');
  }

  try {
    const decoded = jwt.verify(qrToken, QR_SECRET, {
      algorithms: [QR_ALGORITHM],
      ignoreExpiration: true
    });

    return {
      valid: true,
      ticketId: decoded.tid,
      orderId: decoded.oid,
      eventId: decoded.eid,
      userId: decoded.uid,
      ticketTypeId: decoded.type,
      index: decoded.i,
      jti: decoded.jti
    };
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid QR code signature');
    }
    throw err;
  }
};

/**
 * Generate a simple unique ID for QR (without JWT) - used as fallback
 */
export const generateSimpleQRId = (orderId, ticketTypeId, index) => {
  const raw = `${orderId}-${ticketTypeId}-${index}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};
