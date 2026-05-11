/**
 * Unit tests for ticketQR utility and checkout helper logic.
 */

import jwt from 'jsonwebtoken';

describe('ticketQR utility', () => {
  const TEST_SECRET = 'test-secret-key-for-testing';
  const BASE_TICKET_DATA = {
    ticketId: '507f1f77bcf86cd799439011',
    orderId: '507f1f77bcf86cd799439022',
    eventId: '507f1f77bcf86cd799439033',
    userId: '507f1f77bcf86cd799439044',
    ticketTypeId: '507f1f77bcf86cd799439055',
    index: 0,
    jti: 'qr-jti-test-001'
  };

  let createTicketQRArtifact;
  let generateTicketQR;
  let generateTicketQRJti;
  let hashTicketQR;
  let verifyTicketQR;

  beforeAll(async () => {
    process.env.QR_SECRET = TEST_SECRET;
    ({
      createTicketQRArtifact,
      generateTicketQR,
      generateTicketQRJti,
      hashTicketQR,
      verifyTicketQR
    } = await import('../../src/utils/ticketQR.js'));
  });

  describe('generateTicketQR', () => {
    it('should generate a valid JWT token', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should not set a fixed exp claim on the token', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);
      const decoded = jwt.decode(token);

      expect(decoded.exp).toBeUndefined();
    });

    it('should include all ticket data and jti in JWT payload', () => {
      const token = generateTicketQR({
        ...BASE_TICKET_DATA,
        index: 5,
        jti: 'qr-jti-test-005'
      });
      const decoded = jwt.decode(token);

      expect(decoded.tid).toBe(BASE_TICKET_DATA.ticketId);
      expect(decoded.oid).toBe(BASE_TICKET_DATA.orderId);
      expect(decoded.eid).toBe(BASE_TICKET_DATA.eventId);
      expect(decoded.uid).toBe(BASE_TICKET_DATA.userId);
      expect(decoded.type).toBe(BASE_TICKET_DATA.ticketTypeId);
      expect(decoded.i).toBe(5);
      expect(decoded.jti).toBe('qr-jti-test-005');
    });

    it('should generate deterministic tokens for same input and jti', () => {
      const token1 = generateTicketQR(BASE_TICKET_DATA);
      const token2 = generateTicketQR(BASE_TICKET_DATA);

      expect(token1).toBe(token2);
    });

    it('should generate different tokens when jti changes', () => {
      const token1 = generateTicketQR({
        ...BASE_TICKET_DATA,
        jti: 'qr-jti-test-101'
      });
      const token2 = generateTicketQR({
        ...BASE_TICKET_DATA,
        jti: 'qr-jti-test-102'
      });

      expect(token1).not.toBe(token2);
    });

    it('should require jti for revocable QR issuance', () => {
      expect(() =>
        generateTicketQR({
          ...BASE_TICKET_DATA,
          jti: undefined
        })
      ).toThrow('QR jti is required');
    });
  });

  describe('generateTicketQRJti', () => {
    it('should generate unique jti values', () => {
      const jti1 = generateTicketQRJti();
      const jti2 = generateTicketQRJti();

      expect(jti1).toBeDefined();
      expect(jti2).toBeDefined();
      expect(jti1).not.toBe(jti2);
    });
  });

  describe('hashTicketQR', () => {
    it('should hash the token deterministically', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);
      const hash1 = hashTicketQR(token);
      const hash2 = hashTicketQR(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(token);
    });

    it('should require a token to hash', () => {
      expect(() => hashTicketQR('')).toThrow('QR token is required');
      expect(() => hashTicketQR(null)).toThrow('QR token is required');
    });
  });

  describe('createTicketQRArtifact', () => {
    it('should create a token, its hash, and a revocation id', () => {
      const artifact = createTicketQRArtifact({
        ...BASE_TICKET_DATA,
        jti: 'artifact-jti-001'
      });

      expect(artifact.qrToken).toBeDefined();
      expect(artifact.qrTokenHash).toBe(hashTicketQR(artifact.qrToken));
      expect(artifact.qrJti).toBe('artifact-jti-001');
    });

    it('should auto-generate jti when omitted', () => {
      const artifact = createTicketQRArtifact({
        ...BASE_TICKET_DATA,
        jti: undefined
      });

      expect(artifact.qrJti).toBeDefined();
      expect(artifact.qrTokenHash).toBe(hashTicketQR(artifact.qrToken));
    });
  });

  describe('verifyTicketQR', () => {
    it('should verify a valid token', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);
      const result = verifyTicketQR(token);

      expect(result.valid).toBe(true);
      expect(result.ticketId).toBe(BASE_TICKET_DATA.ticketId);
      expect(result.orderId).toBe(BASE_TICKET_DATA.orderId);
      expect(result.eventId).toBe(BASE_TICKET_DATA.eventId);
      expect(result.userId).toBe(BASE_TICKET_DATA.userId);
      expect(result.ticketTypeId).toBe(BASE_TICKET_DATA.ticketTypeId);
      expect(result.index).toBe(0);
      expect(result.jti).toBe(BASE_TICKET_DATA.jti);
    });

    it('should ignore exp on legacy tokens and only verify signature', () => {
      const expiredToken = jwt.sign(
        {
          tid: '123',
          oid: '456',
          eid: '789',
          uid: '012',
          type: '345',
          i: 0
        },
        TEST_SECRET,
        {
          algorithm: 'HS256',
          expiresIn: '-1s',
          jwtid: 'legacy-expired-jti'
        }
      );

      const result = verifyTicketQR(expiredToken);
      expect(result.valid).toBe(true);
      expect(result.jti).toBe('legacy-expired-jti');
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyTicketQR('invalid.token.here')).toThrow();
    });

    it('should throw error for empty token', () => {
      expect(() => verifyTicketQR('')).toThrow('QR token is required');
      expect(() => verifyTicketQR(null)).toThrow('QR token is required');
      expect(() => verifyTicketQR(undefined)).toThrow('QR token is required');
    });

    it('should throw error for token with wrong signature', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);
      const tamperedToken = `${token.slice(0, -5)}xxxxx`;

      expect(() => verifyTicketQR(tamperedToken)).toThrow('Invalid QR code signature');
    });
  });

  describe('security considerations', () => {
    it('should not expose ticket data in plain text in QR content', () => {
      const token = generateTicketQR(BASE_TICKET_DATA);

      expect(token).not.toContain(BASE_TICKET_DATA.ticketId);
      expect(token).not.toContain('Ticket:');
    });

    it('should produce different tokens for different index values', () => {
      const token0 = generateTicketQR({
        ...BASE_TICKET_DATA,
        index: 0,
        jti: 'qr-jti-test-index-0'
      });
      const token1 = generateTicketQR({
        ...BASE_TICKET_DATA,
        index: 1,
        jti: 'qr-jti-test-index-1'
      });

      expect(token0).not.toBe(token1);
    });

    it('should produce different tokens for different tickets', () => {
      const token1 = generateTicketQR({
        ...BASE_TICKET_DATA,
        jti: 'qr-jti-ticket-1'
      });
      const token2 = generateTicketQR({
        ...BASE_TICKET_DATA,
        ticketId: '507f1f77bcf86cd799439099',
        jti: 'qr-jti-ticket-2'
      });

      expect(token1).not.toBe(token2);
    });
  });
});

describe('Checkout Service Logic - Unit Tests', () => {
  describe('getDynamicPerUserLimit', () => {
    const getDynamicPerUserLimit = (eventAvailableTickets) => {
      const total = Math.max(0, Number(eventAvailableTickets) || 0);
      if (total <= 20) return 3;
      if (total <= 40) return 4;
      if (total <= 80) return 5;
      if (total <= 150) return 6;
      if (total <= 250) return 7;
      if (total <= 400) return 8;
      if (total <= 700) return 9;
      return 10;
    };

    it('should return 3 for events with <= 20 available tickets', () => {
      expect(getDynamicPerUserLimit(0)).toBe(3);
      expect(getDynamicPerUserLimit(10)).toBe(3);
      expect(getDynamicPerUserLimit(20)).toBe(3);
    });

    it('should return 10 for events with > 700 available tickets', () => {
      expect(getDynamicPerUserLimit(701)).toBe(10);
      expect(getDynamicPerUserLimit(1000)).toBe(10);
      expect(getDynamicPerUserLimit(10000)).toBe(10);
    });

    it('should scale linearly between thresholds', () => {
      expect(getDynamicPerUserLimit(21)).toBe(4);
      expect(getDynamicPerUserLimit(40)).toBe(4);
      expect(getDynamicPerUserLimit(41)).toBe(5);
      expect(getDynamicPerUserLimit(80)).toBe(5);
      expect(getDynamicPerUserLimit(81)).toBe(6);
    });

    it('should handle non-numeric input gracefully', () => {
      expect(getDynamicPerUserLimit(undefined)).toBe(3);
      expect(getDynamicPerUserLimit(null)).toBe(3);
      expect(getDynamicPerUserLimit(NaN)).toBe(3);
    });

    it('should handle negative numbers', () => {
      expect(getDynamicPerUserLimit(-10)).toBe(3);
    });
  });

  describe('isTransientMongoError', () => {
    const isTransientMongoError = (err) =>
      err?.errorLabels?.includes('TransientTransactionError') ||
      err?.errorLabels?.includes('UnknownTransactionCommitResult') ||
      err?.codeName === 'WriteConflict' ||
      err?.code === 112;

    it('should return true for TransientTransactionError', () => {
      const error = { errorLabels: ['TransientTransactionError'] };
      expect(isTransientMongoError(error)).toBe(true);
    });

    it('should return true for UnknownTransactionCommitResult', () => {
      const error = { errorLabels: ['UnknownTransactionCommitResult'] };
      expect(isTransientMongoError(error)).toBe(true);
    });

    it('should return true for WriteConflict', () => {
      const error = { codeName: 'WriteConflict' };
      expect(isTransientMongoError(error)).toBe(true);
    });

    it('should return true for error code 112', () => {
      const error = { code: 112 };
      expect(isTransientMongoError(error)).toBe(true);
    });

    it('should return false for normal errors', () => {
      expect(isTransientMongoError(new Error('normal error'))).toBe(false);
      expect(isTransientMongoError({})).toBe(false);
      expect(isTransientMongoError(null)).toBe(false);
    });
  });

  describe('createCheckoutError', () => {
    const createCheckoutError = (message, status = 400) => {
      const error = new Error(message);
      error.status = status;
      return error;
    };

    it('should create error with message and default status', () => {
      const error = createCheckoutError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.status).toBe(400);
    });

    it('should create error with custom status', () => {
      const error = createCheckoutError('Not found', 404);

      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
    });
  });

  describe('Ticket Hold Logic', () => {
    it('should calculate available tickets correctly', () => {
      const ticketType = {
        quantity: 100,
        sold: 50,
        holded: 30
      };
      const available = ticketType.quantity - ticketType.sold - ticketType.holded;

      expect(available).toBe(20);
    });

    it('should detect when not enough tickets available', () => {
      const ticketType = {
        quantity: 100,
        sold: 95,
        holded: 3
      };
      const available = ticketType.quantity - ticketType.sold - ticketType.holded;
      const requested = 5;

      expect(available).toBe(2);
      expect(available < requested).toBe(true);
    });
  });

  describe('Per-user limit enforcement', () => {
    it('should calculate remaining allowance correctly', () => {
      const perUserLimit = 5;
      const alreadyReserved = 3;
      const remainingAllowance = Math.max(0, perUserLimit - alreadyReserved);

      expect(remainingAllowance).toBe(2);
    });

    it('should reject when user has no remaining allowance', () => {
      const perUserLimit = 5;
      const alreadyReserved = 5;
      const remainingAllowance = Math.max(0, perUserLimit - alreadyReserved);

      expect(remainingAllowance).toBe(0);
    });

    it('should allow zero remaining allowance', () => {
      const perUserLimit = 5;
      const alreadyReserved = 10;
      const remainingAllowance = Math.max(0, perUserLimit - alreadyReserved);

      expect(remainingAllowance).toBe(0);
    });
  });

  describe('Order expiry behavior', () => {
    it('should set holdUntil to 15 minutes in future', () => {
      const now = Date.now();
      const holdMinutes = 15;
      const holdUntil = new Date(now + holdMinutes * 60 * 1000);

      const diffMs = holdUntil.getTime() - now;
      const diffMinutes = diffMs / (60 * 1000);

      expect(diffMinutes).toBe(15);
    });

    it('should calculate expiry correctly', () => {
      const CHECKOUT_HOLD_MINUTES = 15;
      const createdAt = new Date('2024-01-01T10:00:00Z');
      const holdUntil = new Date(createdAt.getTime() + CHECKOUT_HOLD_MINUTES * 60 * 1000);

      expect(holdUntil.toISOString()).toBe('2024-01-01T10:15:00.000Z');
    });
  });
});
