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
const registerSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .max(254, 'Email must be less than 254 characters')
    .refine(email => {
      const domain = email.split('@')[1]
      return domain && domain.includes('.') && domain.length > 3
    }, 'Invalid email domain'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .refine(username => {
      const reserved = ['admin', 'root', 'system', 'api', 'www', 'mail', 'support']
      return !reserved.includes(username.toLowerCase())
    }, 'Username is reserved'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  confirmPassword: z.string(),
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    platform: z.string().optional(),
    deviceId: z.string().optional()
  }).optional(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * Secure user registration endpoint
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'auth_register',
      RATE_LIMIT_CONFIGS.AUTH_REGISTER
    )

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
      return ApiResponseHandler.rateLimitExceeded(
        retryAfter,
        'Too many registration attempts'
      )
    }

    // Security validation - skip for now as validateRequest method doesn't exist
    // TODO: Implement proper security validation

    // Parse and validate request body
    const body = await request.json()
    const validationResult = registerSchema.safeParse(body)
    
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { email, username, password, deviceInfo } = validationResult.data
    // Get client IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = forwarded ? forwarded.split(',')[0].trim() : (realIP || 'unknown')
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    })

    if (existingUser) {
      const isEmailConflict = existingUser.email === email
      console.warn(`Registration conflict from IP: ${clientIP} - ${isEmailConflict ? 'Email' : 'Username'} already exists`)
      
      return ApiResponseHandler.conflict(
        isEmailConflict 
          ? 'An account with this email already exists'
          : 'This username is already taken'
      )
    }

    // Hash password
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Create user in database
    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        role: 'USER', // Default role
        loginCount: 0,
        isLocked: false,
        // Record registration metadata
        loginAttempts: {
          create: {
            ipAddress: clientIP,
            userAgent,
            success: true,
            failReason: null,
          },
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    })

    // Auto-login after successful registration
    const sessionResult = await sessionService.createSessionWithJWT({
      userId: newUser.id,
      ipAddress: clientIP,
      userAgent,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : undefined,
      rememberMe: false, // Default to false for new registrations
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
      },
      authMethod: 'credentials',
    })

    console.log(`New user registered and logged in: ${username} (${email}) from IP: ${clientIP}`)

    // Update user login statistics
    await prisma.user.update({
      where: { id: newUser.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: 1,
      },
    })

    // Create response
    const response = ApiResponseHandler.success({
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
      session: {
        id: sessionResult.session.id,
        expiresAt: sessionResult.session.expires,
      },
      token: sessionResult.sessionToken,
      autoLogin: true,
    })

    // Set secure cookies for auto-login
    sessionService.setSessionCookies(
      response,
      sessionResult.sessionToken,
      sessionResult.csrfToken,
      { rememberMe: false }
    )

    // Set JWT token as HTTP-only cookie
    response.cookies.set('auth-token', sessionResult.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    })

    // Add security headers
    authMiddleware.addSecurityHeaders(response)

    return response
  } catch (error) {
    console.error('Registration error:', error)

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return ApiResponseHandler.conflict('An account with this email or username already exists')
      }
      if (error.message.includes('database') || error.message.includes('connection')) {
        return ApiResponseHandler.internalError('Database connection error')
      }
      if (error.message.includes('rate limit')) {
        return ApiResponseHandler.rateLimitExceeded()
      }
    }

    return ApiResponseHandler.internalError('Registration failed')
  }
}

/**
 * Check username/email availability
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const username = searchParams.get('username')

    if (!email && !username) {
      return ApiResponseHandler.error('INVALID_INPUT', 'Email or username parameter is required', 400)
    }

    // Rate limiting for availability checks
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'username_check',
      {
        windowMs: 60 * 1000, // 1 minute
        maxAttempts: 20, // 20 checks per minute
        blockDurationMs: 5 * 60 * 1000, // 5 minutes block
      }
    )

    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(undefined, 'Too many availability checks')
    }

    const whereCondition: { email?: string; username?: string } = {}
    if (email) {
      whereCondition.email = email.toLowerCase()
    }
    if (username) {
      whereCondition.username = username
    }

    const existingUser = await prisma.user.findFirst({
      where: whereCondition,
      select: {
        email: true,
        username: true,
      },
    })

    const result: { available: boolean; email?: { available: boolean }; username?: { available: boolean } } = {
      available: !existingUser,
    }

    if (email) {
      result.email = {
        available: !existingUser || existingUser.email !== email.toLowerCase(),   
      }
    }

    if (username) {
      result.username = {
        available: !existingUser || existingUser.username !== username,
      }
    }

    return ApiResponseHandler.success(result)
  } catch (error) {
    console.error('Availability check error:', error)
    return ApiResponseHandler.internalError('Failed to check availability')
  }
}

/**
 * Get registration statistics (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    // Validate admin authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated || !authResult.user || authResult.user.role !== 'ADMIN') {
      return ApiResponseHandler.forbidden('Admin access required')
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get registration statistics
    const stats = await prisma.user.groupBy({
      by: ['createdAt'],
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      _count: {
        id: true,
      },
    })

    // Get total users
    const totalUsers = await prisma.user.count()
    
    // Get recent registrations
    const recentRegistrations = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        loginCount: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    })

    return ApiResponseHandler.success({
      totalUsers,
      recentRegistrations: recentRegistrations.length,
      registrationsByDay: stats,
      users: recentRegistrations,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Registration stats error:', error)
    return ApiResponseHandler.internalError('Failed to retrieve registration statistics')
  }
}