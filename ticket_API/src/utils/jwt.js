import jwt from 'jsonwebtoken';

export function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload) {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });
}

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
