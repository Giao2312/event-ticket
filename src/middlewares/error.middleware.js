import logger from "../utils/logger.js";

const errorMiddleware = (err, req, res, next) => {
  // 1. Xác định mã trạng thái (status code)
  // Nếu là lỗi nghiệp vụ (có status code), dùng nó; nếu không thì mặc định 500
  const statusCode = err.status || 500;

  // 2. Log lỗi chi tiết ra file/console để lập trình viên theo dõi
  logger.error(`[${req.method}] ${req.originalUrl} | Status: ${statusCode} | Error: ${err.message}`);

  // 3. Xử lý đặc biệt cho các loại lỗi phổ biến
  let response = {
    success: false,
    message: err.message || "Đã có lỗi xảy ra trên hệ thống",
  };

  // Nếu là lỗi từ Mongoose (Validation Error)
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: "Lỗi kiểm tra dữ liệu đầu vào",
      errors: err.errors // Chi tiết từng trường bị lỗi
    });
  }

  // Nếu là lỗi JWT Token (TokenExpiredError, JsonWebTokenError)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ"
    });
  }

  // 4. Trả về phản hồi cho client
  res.status(statusCode).json(response);
};

export default errorMiddleware;
