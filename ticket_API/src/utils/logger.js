import winston, { format } from 'winston';

// Cấu hình logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', 

  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Thêm thời gian
    format.errors({ stack: true }), // Hiển thị stack trace đầy đủ
    format.splat(),
    format.json() // Format JSON cho production
  ),

  defaultMeta: { service: 'event-ticket-system' }, // Tag để trace

  transports: [
    // Log ra console (màu sắc đẹp cho dev)
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),

    // Log error vào file riêng
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),

    // Log tất cả vào file tổng hợp
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});

// Nếu dev, thêm log debug chi tiết hơn
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp instanceof Object ? JSON.stringify(timestamp) : timestamp} [${level}]: ${message} `;
        if (Object.keys(metadata).length > 0) msg += JSON.stringify(metadata);
        return msg;
      })
    )
  }));
}

export default logger;
