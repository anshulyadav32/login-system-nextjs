import { NextRequest, NextResponse } from 'next/server'

// CORS configuration interface
export interface CorsConfig {
  allowedOrigins: string[] | '*'
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders?: string[]
  credentials: boolean
  maxAge?: number
  preflightContinue?: boolean
  optionsSuccessStatus?: number
}

// Environment-specific CORS configurations
const CORS_CONFIGS = {
  development: {
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ] as string[],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as string[],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-Challenge',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name'
    ] as string[],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Count',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset'
    ] as string[],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200
  },
  production: {
    allowedOrigins: [
      'https://nuxtjs-frontend.vercel.app',
      'https://nextjs-backend-flame.vercel.app',
      ...(process.env.ALLOWED_ORIGINS?.split(',') || [])
    ] as string[],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] as string[],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'Accept',
      'Origin'
    ] as string[],
    exposedHeaders: [
      'X-Total-Count',
      'X-Rate-Limit-Remaining'
    ] as string[],
    credentials: true,
    maxAge: 3600, // 1 hour
    optionsSuccessStatus: 204
  }
}

export class CorsMiddleware {
  private config: CorsConfig

  constructor(customConfig?: Partial<CorsConfig>) {
    const envConfig = CORS_CONFIGS[process.env.NODE_ENV as keyof typeof CORS_CONFIGS] || CORS_CONFIGS.development
    this.config = { ...envConfig, ...customConfig }
  }

  /**
   * Apply CORS headers to response
   */
  applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
    const origin = request.headers.get('origin')
    
    // Handle origin validation
    if (this.isOriginAllowed(origin)) {
      if (origin) {
        response.headers.set('Access-Control-Allow-Origin', origin)
      }
    } else if (this.config.allowedOrigins === '*') {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }

    // Set credentials header
    if (this.config.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Set allowed methods
    response.headers.set(
      'Access-Control-Allow-Methods',
      this.config.allowedMethods.join(', ')
    )

    // Set allowed headers
    response.headers.set(
      'Access-Control-Allow-Headers',
      this.config.allowedHeaders.join(', ')
    )

    // Set exposed headers
    if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
      response.headers.set(
        'Access-Control-Expose-Headers',
        this.config.exposedHeaders.join(', ')
      )
    }

    // Set max age for preflight requests
    if (this.config.maxAge) {
      response.headers.set('Access-Control-Max-Age', this.config.maxAge.toString())
    }

    // Add Vary header for proper caching
    const varyHeaders = ['Origin']
    if (this.config.credentials) {
      varyHeaders.push('Access-Control-Request-Headers')
      varyHeaders.push('Access-Control-Request-Method')
    }
    response.headers.set('Vary', varyHeaders.join(', '))

    return response
  }

  /**
   * Handle preflight OPTIONS requests
   */
  handlePreflightRequest(request: NextRequest): NextResponse | null {
    if (request.method !== 'OPTIONS') {
      return null
    }

    const origin = request.headers.get('origin')
    const requestMethod = request.headers.get('access-control-request-method')
    const requestHeaders = request.headers.get('access-control-request-headers')

    // Validate origin
    if (!this.isOriginAllowed(origin)) {
      return new NextResponse(null, { 
        status: 403,
        statusText: 'CORS: Origin not allowed'
      })
    }

    // Validate method
    if (requestMethod && !this.config.allowedMethods.includes(requestMethod)) {
      return new NextResponse(null, { 
        status: 405,
        statusText: 'CORS: Method not allowed'
      })
    }

    // Validate headers
    if (requestHeaders) {
      const headers = requestHeaders.split(',').map(h => h.trim().toLowerCase())
      const allowedHeaders = this.config.allowedHeaders.map(h => h.toLowerCase())
      
      for (const header of headers) {
        if (!allowedHeaders.includes(header)) {
          return new NextResponse(null, { 
            status: 400,
            statusText: `CORS: Header '${header}' not allowed`
          })
        }
      }
    }

    // Create successful preflight response
    const response = new NextResponse(null, {
      status: this.config.optionsSuccessStatus || 204
    })

    return this.applyCorsHeaders(request, response)
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string | null): boolean {
    if (!origin) {
      // Allow same-origin requests (no origin header)
      return true
    }

    if (this.config.allowedOrigins === '*') {
      return true
    }

    if (Array.isArray(this.config.allowedOrigins)) {
      return this.config.allowedOrigins.includes(origin)
    }

    return false
  }

  /**
   * Validate CORS request
   */
  validateCorsRequest(request: NextRequest): {
    valid: boolean
    error?: string
    statusCode?: number
  } {
    const origin = request.headers.get('origin')
    const method = request.method

    // Check origin
    if (origin && !this.isOriginAllowed(origin)) {
      return {
        valid: false,
        error: `Origin '${origin}' is not allowed`,
        statusCode: 403
      }
    }

    // Check method
    if (!this.config.allowedMethods.includes(method)) {
      return {
        valid: false,
        error: `Method '${method}' is not allowed`,
        statusCode: 405
      }
    }

    return { valid: true }
  }

  /**
   * Get CORS configuration for debugging
   */
  getConfig(): CorsConfig {
    return { ...this.config }
  }

  /**
   * Update CORS configuration
   */
  updateConfig(newConfig: Partial<CorsConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Create middleware function for Next.js
   */
  middleware() {
    return (request: NextRequest) => {
      // Handle preflight requests
      const preflightResponse = this.handlePreflightRequest(request)
      if (preflightResponse) {
        return preflightResponse
      }

      // Validate CORS for actual requests
      const validation = this.validateCorsRequest(request)
      if (!validation.valid) {
        return new NextResponse(
          JSON.stringify({
            success: false,
            error: {
              code: 'CORS_ERROR',
              message: validation.error,
              timestamp: new Date().toISOString()
            }
          }),
          {
            status: validation.statusCode || 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // Continue with the request and apply CORS headers to response
      const response = NextResponse.next()
      return this.applyCorsHeaders(request, response)
    }
  }
}

// Create environment-specific instances
export const corsMiddleware = new CorsMiddleware()

// Utility function to create custom CORS middleware
export function createCorsMiddleware(config?: Partial<CorsConfig>) {
  return new CorsMiddleware(config)
}

// Predefined configurations for common scenarios
export const CORS_PRESETS = {
  // Allow all origins (development only)
  permissive: {
    allowedOrigins: '*' as const,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['*'],
    credentials: false
  },
  
  // Strict production configuration
  strict: {
    allowedOrigins: [],
    allowedMethods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 300 // 5 minutes
  },
  
  // API-only configuration
  apiOnly: {
    allowedOrigins: [],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With'
    ],
    credentials: true,
    maxAge: 3600 // 1 hour
  }
} as const