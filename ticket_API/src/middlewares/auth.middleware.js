import { verifyToken } from "../utils/jwt.js";
import User from "../models/user.models.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User không tồn tại" });
    }

    req.user = user; // GẮN USER
    next();

  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};
