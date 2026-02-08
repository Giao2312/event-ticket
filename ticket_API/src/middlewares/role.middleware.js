/**
 * Middleware phân quyền theo role
 * @param  {...String} roles - danh sách role được phép
 * @example authorize("admin")
 * @example authorize("admin", "staff")
 */
export const authorize = (...roles) => {
  return (req, res, next) => {

    // Chưa có user (authMiddleware chưa chạy)
    if (!req.user) {
      return res.status(401).json({
        message: "Chưa xác thực người dùng"
      });
    }

    // Không đủ quyền
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Không có quyền truy cập"
      });
    }

    next();
  };
};
