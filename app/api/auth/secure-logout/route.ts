import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sessionService } from '@/lib/session-service'
import { jwtService } from '@/lib/jwt-service'
import { authMiddleware } from '@/middlewares/auth'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'
import { ApiResponseHandler } from '@/lib/api-response'
import { SecurityMiddleware } from '@/middlewares/security'

const responseHandler = new ApiResponseHandler()
const security = new SecurityMiddleware()

// Enhanced validation schema
const logoutSchema = z.object({
  logoutAll: z.boolean().optional().default(false), // Logout from all devices
  reason: z.string().max(255, 'Reason must be less than 255 characters').optional(), // Optional logout reason
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    platform: z.string().optional(),
    deviceId: z.string().optional()
  }).optional(),
})

/**
 * Secure logout endpoint with token blacklisting
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'auth_logout',
      RATE_LIMIT_CONFIGS.AUTH_LOGOUT
    )

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
      return ApiResponseHandler.rateLimitExceeded(
        retryAfter,
        'Too many logout attempts'
      )
    }

    // TODO: Implement security validation
    // const securityValidation = security.validateRequest(request)
    // if (!securityValidation.valid) {
    //   return ApiResponseHandler.forbidden(securityValidation.error || 'Security validation failed')
    // }

    // Validate authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    // Get client IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = forwarded ? forwarded.split(',')[0].trim() : (realIP || 'unknown')
    const userAgent = request.headers.get('user-agent') || 'Unknown'
    const { user, session } = authResult
    
    if (!user) {
      return ApiResponseHandler.unauthorized('User not found')
    }
    
    // Parse request body (optional)
    let logoutOptions: { logoutAll: boolean; reason?: string; deviceInfo?: { userAgent?: string; platform?: string; deviceId?: string } } = { logoutAll: false }
    try {
      const body = await request.json()
      const validationResult = logoutSchema.safeParse(body)
      if (validationResult.success) {
        logoutOptions = validationResult.data
      }
    } catch {
      // Body is optional for logout
    }

    // Get current tokens from request
    const accessToken = authMiddleware.extractToken(request)
    const refreshToken = request.cookies.get('refresh-token')?.value

    if (logoutOptions.logoutAll) {
      // Logout from all devices - invalidate all user sessions and tokens
      await Promise.all([
        // Revoke all refresh tokens
        jwtService.revokeAllRefreshTokens(user.id),
        
        // Invalidate all user sessions
        sessionService.invalidateAllUserSessions(user.id),
      ])
      
      // Blacklist current access token if available
      if (accessToken) {
        await jwtService.blacklistToken(
          accessToken,
          logoutOptions.reason || 'Logout from all devices',
          user.id
        )
      }
    } else {
      // Logout from current device only
      const blacklistPromises = []
      
      // Blacklist current access token
      if (accessToken) {
        blacklistPromises.push(
          jwtService.blacklistToken(
            accessToken,
            user.id,
            logoutOptions.reason || 'User logout'
          )
        )
      }
      
      // Blacklist refresh token if exists
      if (refreshToken) {
        blacklistPromises.push(
          jwtService.blacklistToken(
            refreshToken,
            user.id,
            logoutOptions.reason || 'User logout'
          )
        )
      }
      
      await Promise.all(blacklistPromises)
      
      // Invalidate current session
      if (session) {
        await sessionService.invalidateSession(session.sessionToken)
      }
    }

    console.log(`User logout: ${user.email} from IP: ${clientIP} - ${logoutOptions.logoutAll ? 'All devices' : 'Current device'}`)

    // Create response
    const response = ApiResponseHandler.success({
      message: logoutOptions.logoutAll 
        ? 'Successfully logged out from all devices'
        : 'Successfully logged out',
      loggedOutAt: new Date().toISOString(),
      logoutAll: logoutOptions.logoutAll,
    })

    // Clear all authentication cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0, // Expire immediately
    }

    response.cookies.set('auth-token', '', cookieOptions)
    response.cookies.set('refresh-token', '', cookieOptions)
    response.cookies.set('session-token', '', cookieOptions)
    response.cookies.set('csrf-token', '', {
      ...cookieOptions,
      httpOnly: false, // CSRF token needs to be readable by client
    })

    // Add security headers
    authMiddleware.addSecurityHeaders(response)

    return response
  } catch (error) {
    console.error('Logout error:', error)

    if (error instanceof z.ZodError) {
      return ApiResponseHandler.validationError(error)
    }

    return ApiResponseHandler.internalError('Logout failed')
  }
}

/**
 * Get logout status and cleanup expired sessions
 */
export async function GET(request: NextRequest) {
  try {
    // This endpoint can be used to check logout status or trigger cleanup
    const authResult = await authMiddleware(request)

    if (authResult.authenticated) {
      // User is still authenticated
      return ApiResponseHandler.success({
        message: 'User is authenticated',
        loggedOut: false,
        user: authResult.user,
        session: authResult.session,
      })
    }

    // User is not authenticated (logged out)
    return ApiResponseHandler.success({
      message: 'User is not authenticated',
      loggedOut: true,
    })
  } catch (error) {
    console.error('Get logout status error:', error)
    return ApiResponseHandler.internalError('Failed to check logout status')
  }
}

/**
 * Admin endpoint to force logout users
 */
export async function DELETE(request: NextRequest) {
  try {
    // Validate admin authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated || !authResult.user || authResult.user.role !== 'ADMIN') {
      return ApiResponseHandler.forbidden('Admin access required')
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    const reason = searchParams.get('reason') || 'Admin forced logout'

    if (!targetUserId) {
      return ApiResponseHandler.error('VALIDATION_ERROR', 'User ID is required', 400)
    }

    // Get client IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = forwarded ? forwarded.split(',')[0].trim() : (realIP || 'unknown')
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    // Force logout target user from all devices
    await Promise.all([
      jwtService.revokeAllRefreshTokens(targetUserId),
      sessionService.invalidateAllUserSessions(targetUserId),
    ])

    console.log(`Admin ${authResult.user.email} forced logout for user ${targetUserId} from IP: ${clientIP}`)

    return ApiResponseHandler.success({
      message: `User ${targetUserId} has been logged out from all devices`,
      reason,
      loggedOutAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Admin logout error:', error)
    return ApiResponseHandler.internalError('Failed to force logout user')
  }
}