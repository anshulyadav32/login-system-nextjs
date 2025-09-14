import { NextRequest, NextResponse } from 'next/server'
import { jwtService, type JWTClaims } from '../lib/jwt-service'
import { sessionService } from '../lib/session-service'
import { prisma } from '../lib/prisma'

export interface AuthContext {
  user: {
    id: string
    email: string
    username: string
    role: string
  }
  session?: {
    id: string
    sessionToken: string
    deviceInfo?: string
    ipAddress?: string
  }
  token: JWTClaims
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  requiredRoles?: string[]
  requireCSRF?: boolean
  allowRefreshToken?: boolean
}

export class AuthMiddleware {
  /**
   * Extract token from request (Authorization header or cookie)
   */
  public static extractToken(request: NextRequest): string | null {
    // Try Authorization header first
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    // Try session cookie
    const sessionToken = sessionService.getSessionTokenFromRequest(request)
    if (sessionToken) {
      return sessionToken
    }

    // Try auth-token cookie (for backward compatibility)
    const authCookie = request.cookies.get('auth-token')?.value
    if (authCookie) {
      return authCookie
    }

    return null
  }

  /**
   * Get client IP address
   */
  public static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = request.headers.get('x-client-ip')
    
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    
    return realIP || clientIP || 'unknown'
  }

  /**
   * Validate authentication token and return user context
   */
  static async validateAuth(
    request: NextRequest,
    options: AuthMiddlewareOptions = {}
  ): Promise<{ success: true; context: AuthContext } | { success: false; error: string; status: number }> {
    try {
      // Extract token
      const token = this.extractToken(request)
      
      if (!token) {
        if (options.requireAuth !== false) {
          return {
            success: false,
            error: 'Authentication token required',
            status: 401,
          }
        }
        // If auth is not required and no token, return early
        return {
          success: false,
          error: 'No token provided',
          status: 401,
        }
      }

      // Verify JWT token
      const verificationResult = await jwtService.verifyToken(token)
      
      if (!verificationResult.valid || !verificationResult.payload) {
        return {
          success: false,
          error: verificationResult.error || 'Invalid or expired token',
          status: 401,
        }
      }

      const payload = verificationResult.payload

      // Check token type restrictions
      if (!options.allowRefreshToken && payload.tokenType === 'refresh') {
        return {
          success: false,
          error: 'Refresh token not allowed for this endpoint',
          status: 401,
        }
      }

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isLocked: true,
          lockedUntil: true,
        },
      })

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          status: 401,
        }
      }

      // Check if user is locked
      if (user.isLocked) {
        const now = new Date()
        if (!user.lockedUntil || user.lockedUntil > now) {
          return {
            success: false,
            error: 'Account is locked',
            status: 423, // Locked status
          }
        } else {
          // Unlock user if lock period has expired
          await prisma.user.update({
            where: { id: user.id },
            data: {
              isLocked: false,
              lockedUntil: null,
            },
          })
        }
      }

      // Check role requirements
      if (options.requiredRoles && options.requiredRoles.length > 0) {
        if (!options.requiredRoles.includes(user.role)) {
          return {
            success: false,
            error: 'Insufficient permissions',
            status: 403,
          }
        }
      }

      // Validate CSRF token for state-changing operations
      if (options.requireCSRF && !sessionService.validateCSRFToken(request)) {
        return {
          success: false,
          error: 'CSRF token validation failed',
          status: 403,
        }
      }

      // Validate session if sessionId is present
      let sessionData = undefined
      if (payload.sessionId) {
        const session = await prisma.session.findUnique({
          where: {
            id: payload.sessionId,
            isActive: true,
          },
        })

        if (session && session.expires > new Date()) {
          sessionData = {
            id: session.id,
            sessionToken: session.sessionToken,
            deviceInfo: session.deviceInfo || undefined,
            ipAddress: session.ipAddress || undefined,
          }
        }
      }

      // Create auth context
      const context: AuthContext = {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        session: sessionData,
        token: payload,
      }

      return { success: true, context }
    } catch (error) {
      console.error('Auth validation error:', error)
      return {
        success: false,
        error: 'Authentication failed',
        status: 500,
      }
    }
  }

  /**
   * Middleware wrapper for API routes
   */
  static withAuth(
    handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
    options: AuthMiddlewareOptions = {}
  ) {
    return async (request: NextRequest): Promise<NextResponse> => {
      const authResult = await this.validateAuth(request, options)
      
      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error },
          { status: authResult.status }
        )
      }

      return handler(request, authResult.context)
    }
  }

  /**
   * Rate limiting check
   */
  static async checkRateLimit(
    identifier: string,
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    maxAttempts: number = 5
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowMs)

    // Count recent attempts
    const recentAttempts = await prisma.loginAttempt.count({
      where: {
        ipAddress: identifier,
        createdAt: { gte: windowStart },
      },
    })

    const remaining = Math.max(0, maxAttempts - recentAttempts)
    const resetTime = new Date(now.getTime() + windowMs)

    return {
      allowed: recentAttempts < maxAttempts,
      remaining,
      resetTime,
    }
  }

  /**
   * Log authentication attempt
   */
  static async logAuthAttempt({
    email,
    username,
    ipAddress,
    userAgent,
    success,
    failReason,
    userId,
  }: {
    email?: string
    username?: string
    ipAddress: string
    userAgent?: string
    success: boolean
    failReason?: string
    userId?: string
  }): Promise<void> {
    try {
      await prisma.loginAttempt.create({
        data: {
          email,
          username,
          ipAddress,
          userAgent,
          success,
          failReason,
          userId,
        },
      })
    } catch (error) {
      console.error('Failed to log auth attempt:', error)
    }
  }

  /**
   * Check if user should be locked due to failed attempts
   */
  static async checkAndLockUser(
    userId: string,
    maxFailedAttempts: number = 5,
    lockDurationMs: number = 30 * 60 * 1000 // 30 minutes
  ): Promise<boolean> {
    const recentFailures = await prisma.loginAttempt.count({
      where: {
        userId,
        success: false,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
    })

    if (recentFailures >= maxFailedAttempts) {
      const lockUntil = new Date(Date.now() + lockDurationMs)
      
      await prisma.user.update({
        where: { id: userId },
        data: {
          isLocked: true,
          lockedUntil: lockUntil,
        },
      })

      return true
    }

    return false
  }

  /**
   * Security headers middleware
   */
  static addSecurityHeaders(response: NextResponse): NextResponse {
    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    
    // HSTS header for HTTPS
    if (process.env.NODE_ENV === 'production') {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      )
    }

    return response
  }
}

// Wrapper function to match expected interface
export async function authMiddleware(request: NextRequest) {
  const result = await AuthMiddleware.validateAuth(request)
  
  if (result.success) {
    return {
      authenticated: true,
      user: result.context.user,
      session: result.context.session,
      token: result.context.token
    }
  } else {
    return {
      authenticated: false,
      error: result.error,
      status: result.status
    }
  }
}

// Add static methods to the wrapper function
authMiddleware.extractToken = AuthMiddleware.extractToken
authMiddleware.addSecurityHeaders = AuthMiddleware.addSecurityHeaders
authMiddleware.getClientIP = AuthMiddleware.getClientIP
authMiddleware.checkAndLockUser = AuthMiddleware.checkAndLockUser
authMiddleware.withAuth = AuthMiddleware.withAuth
authMiddleware.validateAuth = AuthMiddleware.validateAuth