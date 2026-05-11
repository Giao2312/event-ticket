/**
 * Unit tests for JWT utility functions
 * These tests use the actual jwt module without complex mocking
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('JWT Utility', () => {
  // Set up environment variables before tests
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing';
  });

  describe('signToken', () => {
    it('should sign a payload with JWT_SECRET', async () => {
      const { signToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123', role: 'user' };
      const token = signToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include payload data in token', async () => {
      const { signToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123', role: 'admin' };
      const token = signToken(payload);
      const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      expect(decoded.id).toBe('123');
      expect(decoded.role).toBe('admin');
    });

    it('should set expiry to 7 days', async () => {
      const { signToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123' };
      const token = signToken(payload);
      const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      const sevenDaysInSeconds = 7 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(sevenDaysInSeconds);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      const { signToken, verifyToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123', role: 'user' };
      const token = signToken(payload);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.id).toBe('123');
      expect(decoded.role).toBe('user');
    });

    it('should return null for invalid token', async () => {
      const { verifyToken } = await import('../../src/utils/jwt.js');
      const decoded = verifyToken('invalid.token.here');
      expect(decoded).toBeNull();
    });

    it('should return null for empty token', async () => {
      const { verifyToken } = await import('../../src/utils/jwt.js');
      expect(verifyToken('')).toBeNull();
      expect(verifyToken(null)).toBeNull();
      expect(verifyToken(undefined)).toBeNull();
    });

    it('should return null for expired token', async () => {
      const { verifyToken } = await import('../../src/utils/jwt.js');
      const expiredToken = jwt.sign(
        { id: '123' },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const decoded = verifyToken(expiredToken);
      expect(decoded).toBeNull();
    });

    it('should return null for token signed with wrong secret', async () => {
      const { verifyToken } = await import('../../src/utils/jwt.js');
      const wrongToken = jwt.sign(
        { id: '123' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      const decoded = verifyToken(wrongToken);
      expect(decoded).toBeNull();
    });
  });

  describe('signRefreshToken', () => {
    it('should sign a payload with refresh secret', async () => {
      const { signRefreshToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123' };
      const token = signRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should set expiry to 30 days', async () => {
      const { signRefreshToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123' };
      const token = signRefreshToken(payload);
      const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(thirtyDaysInSeconds);
    });

    it('should use different secret than access token', async () => {
      const { signToken, signRefreshToken } = await import('../../src/utils/jwt.js');
      const payload = { id: '123' };
      const accessToken = signToken(payload);
      const refreshToken = signRefreshToken(payload);

      // Tokens should be different because they use different secrets
      expect(accessToken).not.toBe(refreshToken);
    });
  });
});

describe('Auth Service - Password Hashing', () => {
  it('should hash password with bcrypt', async () => {
    const password = 'testPassword123';
    const hash = await bcrypt.hash(password, 10);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should verify correct password', async () => {
    const password = 'testPassword123';
    const hash = await bcrypt.hash(password, 10);

    const isMatch = await bcrypt.compare(password, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'testPassword123';
    const hash = await bcrypt.hash(password, 10);

    const isMatch = await bcrypt.compare('wrongPassword', hash);
    expect(isMatch).toBe(false);
  });

  it('should generate different hashes for same password (salt)', async () => {
    const password = 'testPassword123';
    const hash1 = await bcrypt.hash(password, 10);
    const hash2 = await bcrypt.hash(password, 10);

    expect(hash1).not.toBe(hash2);
  });
});
