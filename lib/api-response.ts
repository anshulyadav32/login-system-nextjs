import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

// Standard API response interface
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
    timestamp: string
  }
  meta?: {
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    requestId?: string
  }
}

// Standard error codes
export const ERROR_CODES = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // Business Logic
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
} as const

export class ApiResponseHandler {
  /**
   * Create a successful response
   */
  static success<T>(
    data: T,
    status: number = 200,
    meta?: ApiResponse<T>['meta']
  ): NextResponse {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(meta && { meta })
    }
    
    return NextResponse.json(response, { status })
  }

  /**
   * Create an error response
   */
  static error(
    code: string,
    message: string,
    status: number = 500,
    details?: any
  ): NextResponse {
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        ...(details && { details })
      }
    }
    
    return NextResponse.json(response, { status })
  }

  /**
   * Handle Zod validation errors
   */
  static validationError(error: ZodError): NextResponse {
    const details = error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }))

    return this.error(
      ERROR_CODES.VALIDATION_ERROR,
      'Request validation failed',
      400,
      details
    )
  }

  /**
   * Handle authentication errors
   */
  static unauthorized(message: string = 'Authentication required'): NextResponse {
    return this.error(ERROR_CODES.UNAUTHORIZED, message, 401)
  }

  /**
   * Handle authorization errors
   */
  static forbidden(message: string = 'Insufficient permissions'): NextResponse {
    return this.error(ERROR_CODES.FORBIDDEN, message, 403)
  }

  /**
   * Handle not found errors
   */
  static notFound(resource: string = 'Resource'): NextResponse {
    return this.error(
      ERROR_CODES.NOT_FOUND,
      `${resource} not found`,
      404
    )
  }

  /**
   * Handle conflict errors
   */
  static conflict(message: string): NextResponse {
    return this.error(ERROR_CODES.CONFLICT, message, 409)
  }

  /**
   * Handle rate limit errors
   */
  static rateLimitExceeded(
    retryAfter?: number,
    message: string = 'Rate limit exceeded'
  ): NextResponse {
    const response = this.error(ERROR_CODES.RATE_LIMIT_EXCEEDED, message, 429)
    
    if (retryAfter) {
      response.headers.set('Retry-After', retryAfter.toString())
    }
    
    return response
  }

  /**
   * Handle internal server errors
   */
  static internalError(
    message: string = 'Internal server error',
    details?: any
  ): NextResponse {
    // Log the error details for debugging (don't expose to client)
    console.error('Internal server error:', details)
    
    return this.error(
      ERROR_CODES.INTERNAL_ERROR,
      message,
      500,
      process.env.NODE_ENV === 'development' ? details : undefined
    )
  }

  /**
   * Handle database errors
   */
  static databaseError(error: any): NextResponse {
    console.error('Database error:', error)
    
    // Don't expose database details in production
    const message = process.env.NODE_ENV === 'development' 
      ? `Database error: ${error.message}`
      : 'Database operation failed'
    
    return this.error(ERROR_CODES.DATABASE_ERROR, message, 500)
  }

  /**
   * Generic error handler that categorizes different error types
   */
  static handleError(error: unknown): NextResponse {
    console.error('API Error:', error)

    // Zod validation errors
    if (error instanceof ZodError) {
      return this.validationError(error)
    }

    // Standard Error objects
    if (error instanceof Error) {
      // Check for specific error messages to categorize
      if (error.message.includes('not found')) {
        return this.notFound()
      }
      
      if (error.message.includes('already exists')) {
        return this.conflict(error.message)
      }
      
      if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
        return this.unauthorized(error.message)
      }
      
      if (error.message.includes('forbidden') || error.message.includes('permission')) {
        return this.forbidden(error.message)
      }
      
      // Database-related errors
      if (error.message.includes('Prisma') || error.message.includes('database')) {
        return this.databaseError(error)
      }
      
      return this.internalError(error.message)
    }

    // Unknown error type
    return this.internalError('An unexpected error occurred')
  }
}

// Convenience functions for common responses
export const ApiSuccess = ApiResponseHandler.success
export const ApiError = ApiResponseHandler.error
export const ApiValidationError = ApiResponseHandler.validationError
export const ApiUnauthorized = ApiResponseHandler.unauthorized
export const ApiForbidden = ApiResponseHandler.forbidden
export const ApiNotFound = ApiResponseHandler.notFound
export const ApiConflict = ApiResponseHandler.conflict
export const ApiRateLimitExceeded = ApiResponseHandler.rateLimitExceeded
export const ApiInternalError = ApiResponseHandler.internalError
export const ApiHandleError = ApiResponseHandler.handleError