
import jwt from 'jsonwebtoken';

export const signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d' 
  });
};

export const signRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};


export const verifyToken = (token) => {
  try {
    // Trả về decoded object nếu thành công
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // Nếu token lỗi hoặc hết hạn, trả về null để controller xử lý
    return null;
  }
};
