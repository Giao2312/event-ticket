import winston, { format } from 'winston';

// Cấu hình logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', 

  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }), 
    format.splat(),
    format.json() 
  ),

  defaultMeta: { service: 'event-ticket-system' },

  transports: [
    
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    }),

    
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),

    
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});


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
