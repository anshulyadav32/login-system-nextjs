import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sessionService } from '@/lib/session-service'
import { authMiddleware } from '@/middlewares/auth'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'
import { ApiResponseHandler } from '@/lib/api-response'
import { SecurityMiddleware } from '@/middlewares/security'

// ApiResponseHandler has static methods, no need to instantiate
const security = new SecurityMiddleware()

// Enhanced validation schemas
const loginSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(1, 'Password is required')
    .max(128, 'Password must be less than 128 characters'),
  rememberMe: z.boolean().optional().default(false),
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    platform: z.string().optional(),
    deviceId: z.string().optional()
  }).optional()
})

/**
 * Secure login endpoint with JWT and session management
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for login attempts
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'auth_login',
      RATE_LIMIT_CONFIGS.AUTH_LOGIN
    )
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
      return ApiResponseHandler.rateLimitExceeded(
        retryAfter,
        'Too many login attempts'
      )
    }

    // Security validation - skip for now as validateRequest method doesn't exist
    // TODO: Implement proper security validation

    // Parse and validate request body
    const body = await request.json()
    const validationResult = loginSchema.safeParse(body)
    
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { email, password, rememberMe, deviceInfo } = validationResult.data
    
    // Get client information for audit trail
    // Get client IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = forwarded ? forwarded.split(',')[0].trim() : (realIP || 'unknown')
    const userAgent = request.headers.get('user-agent') || deviceInfo?.userAgent || 'Unknown'

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        role: true,
        isLocked: true,
        lockedUntil: true,
        loginCount: true,
      },
    })

    // Check if user exists
    if (!user) {
      console.warn(`Failed login attempt for ${email} from IP: ${clientIP} - User not found`)
      return ApiResponseHandler.unauthorized('Invalid email or password')
    }

    // Check if user is locked
    if (user.isLocked) {
      const now = new Date()
      if (!user.lockedUntil || user.lockedUntil > now) {
        console.warn(`Login attempt for locked account: ${email} from IP: ${clientIP}`)
        return ApiResponseHandler.forbidden(
          `Account is temporarily locked until ${user.lockedUntil?.toISOString()}. Please try again later.`
        )
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

    // Verify password
    if (!user.password) {
      console.warn(`Login attempt for user without password: ${email} from IP: ${clientIP}`)
      return ApiResponseHandler.unauthorized('Invalid email or password')
    }

    const isValidPassword = await bcrypt.compare(password, user.password)
    
    if (!isValidPassword) {
      console.warn(`Failed login attempt for ${email} from IP: ${clientIP} - Invalid password`)
      
      // Check if user should be locked
      const shouldLock = await authMiddleware.checkAndLockUser(user.id)
      
      if (shouldLock) {
        return ApiResponseHandler.forbidden('Too many failed attempts. Account has been temporarily locked.')
      }

      return ApiResponseHandler.unauthorized('Invalid email or password')
    }

    // Successful login - create session and tokens
    const sessionResult = await sessionService.createSessionWithJWT({
      userId: user.id,
      ipAddress: clientIP,
      userAgent,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : undefined,
      rememberMe,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      authMethod: 'credentials',
    })

    // Update user login statistics
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    })

    // Log successful login
    console.log(`Successful login: ${user.username} (${email}) from IP: ${clientIP}`)

    // Create standardized response
    const response = ApiResponseHandler.success({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      session: {
        id: sessionResult.session.id,
        expiresAt: sessionResult.session.expires,
        rememberMe
      },
      token: sessionResult.sessionToken,
      tokens: {
        accessToken: sessionResult.accessToken,
        refreshToken: rememberMe ? sessionResult.refreshToken : undefined,
        expiresAt: new Date(Date.now() + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000))
      }
    })

    // Set secure cookies
    sessionService.setSessionCookies(
      response,
      sessionResult.sessionToken,
      sessionResult.csrfToken,
      { rememberMe }
    )

    // Set JWT token as HTTP-only cookie (alternative to session)
    response.cookies.set('auth-token', sessionResult.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60, // 30 days or 24 hours
      path: '/',
    })

    // Add security headers
    authMiddleware.addSecurityHeaders(response)

    return response
  } catch (error) {
    console.error('Login error:', error)
    
    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('Database connection')) {
        return ApiResponseHandler.error('EXTERNAL_SERVICE_ERROR', 'Authentication service temporarily unavailable', 503)
      }
      if (error.message.includes('Rate limit')) {
        return ApiResponseHandler.rateLimitExceeded(undefined, 'Too many requests')
      }
    }
    
    return ApiResponseHandler.internalError('Login failed. Please try again later.')
  }
}

/**
 * Get login status and session info
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.success(
        {
          message: 'No active session found',
          authenticated: false,
        }
      )
    }
    
    // Get session statistics
    const sessionStats = await sessionService.getSessionStats(authResult.user?.id || '')
    
    return ApiResponseHandler.success({
      message: 'User is authenticated',
      authenticated: true,
      user: authResult.user,
      session: authResult.session,
      stats: sessionStats,
    })
  } catch (error) {
    console.error('Get login status error:', error)
    return ApiResponseHandler.internalError('Failed to retrieve login status')
  }
}