import jwt from "jsonwebtoken";
import User from "../models/user.models.js";
import logger from "../utils/logger.js";

const authMiddleware = async (req, res, next) => {
  try {

    let token = null;

    // 1️⃣ Lấy token từ cookie
    if (req.cookies?.token) {
      token = req.cookies.token;
    }

    // 2️⃣ Lấy token từ Authorization header
    else if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 3️⃣ Không có token
    if (!token) {
      req.user = null;
      return next();
    }

    // 4️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      req.user = null;
      return next();
    }

    // 5️⃣ Lấy user từ DB
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      req.user = null;
      return next();
    }

    // 6️⃣ Attach user vào request
    req.user = user;

    console.log("Auth success - user attached:", user.email);

    next();

  } catch (err) {

    console.error("Auth middleware error:", err.message);
    logger.error("Auth middleware error:", err);

    // token lỗi → clear cookie
    res.clearCookie("token");

    req.user = null;

    next();
  }
};

export const verifyToken = authMiddleware;

export const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Bạn cần đăng nhập để thực hiện hành động này" });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Bạn không có quyền truy cập vào tài nguyên này" });
    }

    next();
};

export default authMiddleware;
