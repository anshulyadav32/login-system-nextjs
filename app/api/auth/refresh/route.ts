import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtService } from '@/lib/jwt-service'
import { sessionService } from '@/lib/session-service'
import { authMiddleware } from '@/middlewares/auth'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'
import { ApiResponseHandler } from '@/lib/api-response'
import { SecurityMiddleware } from '@/middlewares/security'
import { prisma } from '@/lib/prisma'

const responseHandler = new ApiResponseHandler()
const security = new SecurityMiddleware()

// Enhanced validation schema
const refreshSchema = z.object({
  refreshToken: z.string().optional(), // Can be provided in body or cookie
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    platform: z.string().optional(),
    deviceId: z.string().optional()
  }).optional(),
})

/**
 * Token refresh endpoint
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for refresh attempts
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'auth_refresh',
      RATE_LIMIT_CONFIGS.AUTH_REFRESH
    )
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
      return ApiResponseHandler.rateLimitExceeded(
        retryAfter,
        'Too many refresh attempts'
      )
    }

    // TODO: Implement security validation
    // const securityValidation = security.validateRequest(request)
    // if (!securityValidation.valid) {
    //   return ApiResponseHandler.forbidden(securityValidation.error || 'Security validation failed')
    // }

    // Get client information for audit trail
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-client-ip') ||
      'unknown'
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    // Parse request body
    let body: { refreshToken?: string; deviceInfo?: { userAgent?: string; platform?: string; deviceId?: string } } = {}
    try {
      body = refreshSchema.parse(await request.json())
    } catch {
      // Body is optional, we can get refresh token from cookies
    }

    // Get refresh token from body or cookie
    const refreshToken = body.refreshToken || 
                        request.cookies.get('refresh-token')?.value

    if (!refreshToken) {
      console.warn(`Refresh attempt without token from IP: ${clientIP}`)
      return ApiResponseHandler.unauthorized('Refresh token is required')
    }

    // Verify refresh token
    const tokenValidation = await jwtService.verifyToken(refreshToken)
    
    if (!tokenValidation.valid) {
      console.warn(`Invalid refresh token from IP: ${clientIP} - ${tokenValidation.error}`)
      return ApiResponseHandler.unauthorized('Invalid or expired refresh token')
    }

    const { payload } = tokenValidation
    
    if (!payload) {
      console.warn(`Invalid token payload from IP: ${clientIP}`);
      return ApiResponseHandler.unauthorized('Invalid token payload');
    }
    
    // Verify this is actually a refresh token
    if (payload.tokenType !== 'refresh') {
      console.warn(`Invalid token type from IP: ${clientIP} - Expected refresh token`)
      return ApiResponseHandler.unauthorized('Invalid token type')
    }

    // Check if refresh token exists in database and is not revoked
    const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex')
    const dbRefreshToken = await prisma.refreshToken.findFirst({
      where: { 
        token: tokenHash,
        userId: payload.sub,
        isRevoked: false,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isLocked: true,
            lockedUntil: true,
          },
        },
      },
    })

    if (!dbRefreshToken) {
      console.warn(`Revoked or missing refresh token from IP: ${clientIP} - User: ${payload.sub}`)
      return ApiResponseHandler.unauthorized('Refresh token has been revoked')
    }

    // Check if user is locked
    const user = dbRefreshToken.user
    if (user.isLocked) {
      const now = new Date()
      if (!user.lockedUntil || user.lockedUntil > now) {
        console.warn(`Refresh attempt for locked account: ${user.email} from IP: ${clientIP}`)
        return ApiResponseHandler.forbidden('Account is temporarily locked')
      }
    }

    // Check if refresh token is close to expiration (within 1 hour)
    // If so, issue a new refresh token as well
    if (!payload.exp) {
      console.warn(`Token missing expiration from IP: ${clientIP}`);
      return ApiResponseHandler.unauthorized('Invalid token format');
    }
    
    const tokenExp = new Date(payload.exp * 1000)
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
    const shouldRotateRefreshToken = tokenExp <= oneHourFromNow

    // Generate new access token
    const newAccessToken = await jwtService.generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    })

    let newRefreshToken = refreshToken

    // Rotate refresh token if needed
    if (shouldRotateRefreshToken) {
      // Revoke old refresh token
      await prisma.refreshToken.update({
        where: { id: dbRefreshToken.id },
        data: { 
          isRevoked: true,
        },
      })

      // Generate new refresh token
      const refreshTokenResult = await jwtService.generateRefreshToken(
        user.id,
        {
          deviceInfo: body.deviceInfo ? JSON.stringify(body.deviceInfo) : undefined,
          ipAddress: clientIP
        }
      )

      newRefreshToken = refreshTokenResult.token
    } else {
      // Token is still valid, no need to update anything
      // The refresh token will be used as-is
    }

    // Update session if exists
    let sessionData = null
    if (payload.sessionId) {
      try {
        sessionData = await sessionService.refreshSession(payload.sessionId)
      } catch (error) {
        console.warn('Failed to refresh session:', error)
        // Continue without session refresh
      }
    }

    console.log(`Successful token refresh for user: ${user.email} from IP: ${clientIP}`)

    // Create response
    const response = ApiResponseHandler.success(
      {
        message: 'Tokens refreshed successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
        tokens: {
          accessToken: newAccessToken.token,
          refreshToken: shouldRotateRefreshToken ? newRefreshToken : refreshToken,
          expiresIn: 15 * 60, // 15 minutes in seconds
        },
        session: sessionData ? {
          id: sessionData.id,
          expiresAt: sessionData.expires,
        } : undefined,
      }
    )

    // Set new tokens as HTTP-only cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }

    // Set new access token
    response.cookies.set('auth-token', newAccessToken.token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60, // 24 hours
    })

    // Set new refresh token if rotated
    if (shouldRotateRefreshToken) {
      response.cookies.set('refresh-token', newRefreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60, // 30 days
      })
    }

    // Session was refreshed - no need to update session token
    // The existing session token remains valid with updated expiry

    // Add security headers
    authMiddleware.addSecurityHeaders(response)

    return response
  } catch (error) {
    console.error('Token refresh error:', error)

    if (error instanceof z.ZodError) {
      return ApiResponseHandler.validationError(error)
    }

    return ApiResponseHandler.internalError('Token refresh failed')
  }
}

/**
 * Get refresh token information
 */
export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }
    
    if (!authResult.user) {
      return ApiResponseHandler.unauthorized('User not found');
    }
    
    // Get user's refresh tokens
    const refreshTokens = await prisma.refreshToken.findMany({
      where: {
        userId: authResult.user.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        createdAt: true,
        isRevoked: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return ApiResponseHandler.success(
      {
        message: 'Refresh tokens retrieved successfully',
        refreshTokens: refreshTokens.map(token => ({
          ...token,
          token: token.token.substring(0, 8) + '...', // Partial token for security
        })),
        total: refreshTokens.length,
      }
    )
  } catch (error) {
    console.error('Get refresh tokens error:', error)
    return ApiResponseHandler.internalError('Failed to retrieve refresh tokens')
  }
}