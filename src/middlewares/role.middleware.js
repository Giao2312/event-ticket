/**
 * Middleware phân quyền theo role
 * @param  {...String} roles - danh sách role được phép
 * @example authorize("admin")
 * @example authorize("admin", "staff")
 */
import logger from '../utils/logger.js';

export const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    // Kiểm tra đã đăng nhập chưa
    if (!req.user) {
      logger.warn(`Chưa xác thực - Route yêu cầu role: ${roles.join(', ')}`);
      
      // Phân biệt web (Pug) và api (JSON)
      if (req.accepts('html')) {
        return res.redirect('/login?error=unauthenticated');
      }
      
      return res.status(401).json({
        success: false,
        message: 'Chưa xác thực người dùng. Vui lòng đăng nhập.'
      });
    }

    // Kiểm tra quyền
    if (!roles.includes(req.user.role)) {
      logger.warn(`Không có quyền - User: ${req.user.id} (${req.user.role}) - Yêu cầu: ${roles.join(', ')}`);

      if (req.accepts('html')) {
        return res.status(403).render('clients/page/error/403', {
          pageTitle: 'Không có quyền truy cập',
          message: 'Bạn không có quyền truy cập trang này.'
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập tài nguyên này.'
      });
    }

    next();
  };
};

export default roleMiddleware;
