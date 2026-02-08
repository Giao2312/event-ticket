/**
 * Middleware phân quyền theo role
 * @param  {...String} roles - danh sách role được phép
 * @example authorize("admin")
 * @example authorize("admin", "staff")
 */
export const roleMiddleware = (...roles) => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        message: "Chưa xác thực người dùng"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Không có quyền truy cập"
      });
    }

    next();
  };
};
 export default roleMiddleware;