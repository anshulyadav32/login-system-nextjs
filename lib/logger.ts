import { createLogger, format, transports } from 'winston'

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
}

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
}

// Create the logger
const logger = createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
  levels,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    format.colorize({ all: true }),
    format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  transports: [
    // Console transport
    new transports.Console(),
    // File transport for errors
    new transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    // File transport for all logs
    new transports.File({
      filename: 'logs/combined.log'
    })
  ]
})

// Create logs directory if it doesn't exist
if (process.env.NODE_ENV !== 'test') {
  const fs = require('fs')
  const path = require('path')
  const logsDir = path.join(process.cwd(), 'logs')
  
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
}

// Export logger with additional methods
export const log = {
  error: (message: string, meta?: any) => {
    logger.error(message, meta)
  },
  warn: (message: string, meta?: any) => {
    logger.warn(message, meta)
  },
  info: (message: string, meta?: any) => {
    logger.info(message, meta)
  },
  http: (message: string, meta?: any) => {
    logger.http(message, meta)
  },
  debug: (message: string, meta?: any) => {
    logger.debug(message, meta)
  }
}

// Export the winston logger instance for advanced usage
export { logger }

// Helper function for API request logging
export const logApiRequest = (method: string, url: string, statusCode: number, duration: number) => {
  const message = `${method} ${url} ${statusCode} - ${duration}ms`
  
  if (statusCode >= 500) {
    log.error(message)
  } else if (statusCode >= 400) {
    log.warn(message)
  } else {
    log.http(message)
  }
}

// Helper function for authentication logging
export const logAuthEvent = (event: string, userId?: string, email?: string, success: boolean = true) => {
  const message = `Auth Event: ${event} - User: ${userId || email || 'unknown'} - Success: ${success}`
  
  if (success) {
    log.info(message)
  } else {
    log.warn(message)
  }
}

// Helper function for error logging with context
export const logError = (error: Error, context?: string, userId?: string) => {
  const message = `Error${context ? ` in ${context}` : ''}: ${error.message}${userId ? ` - User: ${userId}` : ''}`
  log.error(message, {
    stack: error.stack,
    context,
    userId
  })
}