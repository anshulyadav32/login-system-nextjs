import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { prisma } from '@/lib/prisma'
import { sessionService } from '@/lib/session-service'
import { jwtService } from '@/lib/jwt-service'
import { authMiddleware } from '@/middlewares/auth'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'
import { ApiResponseHandler } from '@/lib/api-response'

const responseHandler = new ApiResponseHandler()

// Profile update validation schema
const updateProfileSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must be less than 255 characters')
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number')
    .optional(),
  confirmPassword: z.string().optional(),
  profilePicture: z.string()
    .url('Invalid profile picture URL')
    .optional()
}).refine((data) => {
  // If newPassword is provided, currentPassword must also be provided
  if (data.newPassword && !data.currentPassword) {
    return false
  }
  // If newPassword is provided, confirmPassword must match
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false
  }
  return true
}, {
  message: 'Password validation failed',
  path: ['newPassword']
})

// Profile query schema
const profileQuerySchema = z.object({
  includeStats: z.boolean().optional().default(false),
  includeSessions: z.boolean().optional().default(false)
})

/**
 * Get user profile with session information
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request, 
      'auth_profile',
      RATE_LIMIT_CONFIGS.AUTH_PROFILE
    )
    
    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(
        Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        'Too many profile requests'
      )
    }

    // Authenticate user
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    // Validate query parameters
    const url = new URL(request.url)
    const queryParams = {
      includeStats: url.searchParams.get('includeStats') === 'true',
      includeSessions: url.searchParams.get('includeSessions') === 'true'
    }

    const validationResult = profileQuerySchema.safeParse(queryParams)
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { includeStats, includeSessions } = validationResult.data
    const { user: authUser } = authResult
    
    // Check if user is authenticated
    if (!authUser) {
      return ApiResponseHandler.unauthorized('User not authenticated')
    }
    
    // Get comprehensive user profile
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        loginCount: true,
        isLocked: true,
        lockedUntil: true,
        sessions: includeSessions ? {
          where: {
            expires: { gt: new Date() },
            isActive: true,
          },
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            deviceInfo: true,
            createdAt: true,
            updatedAt: true,
            expires: true,
          },
          orderBy: { updatedAt: 'desc' },
        } : false,
        refreshTokens: includeSessions ? {
          where: {
            isRevoked: false,
            expiresAt: { gt: new Date() },
          },
          select: {
            id: true,
            token: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        } : false,
        loginAttempts: includeStats ? {
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            success: true,
            createdAt: true,
            failReason: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 login attempts
        } : false,
      },
    })

    if (!user) {
      return ApiResponseHandler.notFound('User profile not found')
    }

    const profileData: any = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
        isLocked: user.isLocked,
        lockedUntil: user.lockedUntil
      }
    }

    // Include user statistics if requested
    if (includeStats) {
      const sessionStats = await sessionService.getSessionStats(user.id)
      
      profileData.stats = {
        totalLogins: user.loginCount || 0,
        accountAge: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        lastActivity: user.lastLoginAt,
        recentLoginAttempts: user.loginAttempts?.length || 0,
        sessionStats
      }
    }

    // Include active sessions if requested
    if (includeSessions) {
      // Get current JWT token information
      const authHeader = request.headers.get('authorization')
      const currentToken = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : request.cookies.get('auth-token')?.value || null
      let tokenInfo = null
      
      if (currentToken) {
        const tokenValidation = await jwtService.verifyToken(currentToken)
        if (tokenValidation.valid && tokenValidation.payload) {
          tokenInfo = {
            type: tokenValidation.payload.tokenType,
            issuedAt: new Date(tokenValidation.payload.iat! * 1000),
            expiresAt: new Date(tokenValidation.payload.exp! * 1000),
            issuer: tokenValidation.payload.iss,
            tokenId: tokenValidation.payload.jti?.substring(0, 8) + '...',
          }
        }
      }
      
      profileData.sessions = {
        active: user.sessions?.length || 0,
        details: user.sessions?.map(session => ({
          id: session.id,
          deviceInfo: session.deviceInfo,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          expires: session.expires
        })) || [],
        refreshTokens: user.refreshTokens?.map(token => ({
          ...token,
          tokenId: token.token.substring(0, 8) + '...', // Partial token for security
        })) || [],
        currentToken: tokenInfo
      }
      
      profileData.security = {
        activeSessions: user.sessions?.length || 0,
        activeRefreshTokens: user.refreshTokens?.length || 0,
        accountLocked: user.isLocked,
        lockExpiresAt: user.lockedUntil?.toISOString(),
      }
    }

    return ApiResponseHandler.success(profileData)
  } catch (error) {
    console.error('Get profile error:', error)
    return ApiResponseHandler.internalError('Failed to fetch user profile')
  }
}

/**
 * Update user profile
 */
export async function PUT(request: NextRequest) {
  try {
    // Apply rate limiting for profile updates
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request, 
      'profile_update',
      RATE_LIMIT_CONFIGS.API_PROFILE_UPDATE
    )
    
    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(
        Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        'Too many profile update requests'
      )
    }

    // Authenticate user
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    const { user: authUser } = authResult
    
    // Check if user is authenticated
    if (!authUser) {
      return ApiResponseHandler.unauthorized('User not authenticated')
    }
    
    // Parse and validate request body
    const body = await request.json()
    const validationResult = updateProfileSchema.safeParse(body)
    
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const updateData = validationResult.data
    
    // Check if username is already taken (if updating username)
    if (updateData.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: updateData.username,
          id: { not: authUser.id }
        }
      })
      
      if (existingUser) {
        return ApiResponseHandler.conflict('Username is already taken')
      }
    }
    
    // Check if email is already taken (if updating email)
    if (updateData.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: updateData.email,
          id: { not: authUser.id }
        }
      })
      
      if (existingUser) {
        return ApiResponseHandler.conflict('Email is already registered')
      }
    }
    
    // Verify current password if changing password
    if (updateData.newPassword && updateData.currentPassword) {
      const currentUser = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { password: true }
      })
      
      if (!currentUser || !currentUser.password) {
        return ApiResponseHandler.notFound('User not found or password not set')
      }
      
      const isCurrentPasswordValid = await bcrypt.compare(
        updateData.currentPassword,
        currentUser.password
      )
      
      if (!isCurrentPasswordValid) {
        return ApiResponseHandler.unauthorized('Current password is incorrect')
      }
    }
    
    // Prepare update data
    const updateFields: any = {}
    
    if (updateData.username) updateFields.username = updateData.username
    if (updateData.email) {
      updateFields.email = updateData.email
      updateFields.emailVerified = false // Reset email verification
    }
    if (updateData.profilePicture) updateFields.profilePicture = updateData.profilePicture
    
    // Hash new password if provided
    if (updateData.newPassword) {
      updateFields.password = await bcrypt.hash(updateData.newPassword, 12)
      updateFields.passwordChangedAt = new Date()
    }
    
    updateFields.updatedAt = new Date()
    
    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: updateFields,
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true
      }
    })
    
    // If password was changed, invalidate all other sessions
    if (updateData.newPassword) {
      await sessionService.invalidateAllUserSessions(authUser.id)
      
      // Revoke all refresh tokens except current one
      await prisma.refreshToken.updateMany({
        where: {
          userId: authUser.id,
          isRevoked: false
        },
        data: {
          isRevoked: true
        }
      })
    }
    
    return ApiResponseHandler.success({
      user: updatedUser,
      message: 'Profile updated successfully',
      changes: Object.keys(updateFields).filter(key => key !== 'updatedAt'),
      passwordChanged: !!updateData.newPassword
    })
    
  } catch (error) {
    console.error('Update profile error:', error)
    return ApiResponseHandler.internalError('Failed to update user profile')
  }
}

/**
 * Update user profile
 */
export async function PATCH(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
  const userAgent = request.headers.get('user-agent') || undefined

  try {
    // Rate limiting check
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'profile_update',
      {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 5, // 5 updates per 15 minutes
        blockDurationMs: 30 * 60 * 1000, // 30 minutes block
      }
    )

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Too many profile update attempts. Please try again later.',
          retryAfter: Math.ceil(
            (rateLimitResult.resetTime.getTime() - Date.now()) / 1000
          ),
        },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil(
              (rateLimitResult.resetTime.getTime() - Date.now()) / 1000
            ).toString(),
          },
        }
      )
    }

    // Validate authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    const { user } = authResult
    
    if (!user) {
      return ApiResponseHandler.unauthorized('User not found')
    }
    
    // Parse and validate request body
    const body = await request.json()
    const updateData = updateProfileSchema.parse(body)

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        role: true,
      },
    })

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check for conflicts with existing users
    if (updateData.email || updateData.username) {
      const conflictWhere: { AND: Array<{ id?: { not: string }; OR?: Array<{ email?: string; username?: string }> }> } = {
        AND: [
          { id: { not: currentUser.id } }, // Exclude current user
          {
            OR: [],
          },
        ],
      }

      if (updateData.email && updateData.email !== currentUser.email) {
        (conflictWhere.AND[1] as { OR: Array<{ email?: string; username?: string }> }).OR.push({ email: updateData.email })
      }
      if (updateData.username && updateData.username !== currentUser.username) {
        (conflictWhere.AND[1] as { OR: Array<{ email?: string; username?: string }> }).OR.push({ username: updateData.username })
      }
      

      if (conflictWhere.AND[1].OR && conflictWhere.AND[1].OR.length > 0) {
        const existingUser = await prisma.user.findFirst({
          where: conflictWhere,
          select: {
            email: true,
            username: true,
          },
        })

        if (existingUser) {
          await RateLimiter.recordAttempt(request, 'profile_update', false, {
            userId: currentUser.id,
            failReason: 'Conflict with existing user',
          })

          return NextResponse.json(
            {
              error: existingUser.email === updateData.email 
                ? 'An account with this email already exists'
                : 'This username is already taken',
              field: existingUser.email === updateData.email ? 'email' : 'username',
            },
            { status: 409 }
          )
        }
      }
    }

    // Handle password change
    let hashedNewPassword: string | undefined
    if (updateData.newPassword && updateData.currentPassword) {
      // Verify current password
      if (!currentUser.password) {
        return NextResponse.json(
          { error: 'No password is currently set for this account' },
          { status: 400 }
        )
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        updateData.currentPassword,
        currentUser.password
      )

      if (!isCurrentPasswordValid) {
        await RateLimiter.recordAttempt(request, 'profile_update', false, {
          userId: currentUser.id,
          failReason: 'Invalid current password',
        })

        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        )
      }

      // Hash new password
      const saltRounds = 12
      hashedNewPassword = await bcrypt.hash(updateData.newPassword, saltRounds)
    }

    // Prepare update data
    const prismaUpdateData: { email?: string; username?: string; password?: string } = {}
    if (updateData.email) prismaUpdateData.email = updateData.email
    if (updateData.username) prismaUpdateData.username = updateData.username
    if (hashedNewPassword) prismaUpdateData.password = hashedNewPassword

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: prismaUpdateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        updatedAt: true,
      },
    })

    // If password was changed, invalidate all other sessions and refresh tokens
    if (hashedNewPassword) {
      await Promise.all([
        // Blacklist current JWT token
        jwtService.blacklistToken(
          authMiddleware.extractToken(request) || '',
          'Password changed',
          currentUser.id
        ),
        
        // Invalidate all other user sessions except current one
        sessionService.invalidateAllUserSessions(currentUser.id),
      ])
    }

    // Record successful update
    await RateLimiter.recordAttempt(request, 'profile_update', true, {
      userId: currentUser.id,
    })

    const response = NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      changes: {
        email: updateData.email !== undefined,
        username: updateData.username !== undefined,
        password: !!hashedNewPassword,
      },
      securityActions: hashedNewPassword ? {
        otherSessionsInvalidated: true,
        otherTokensBlacklisted: true,
        message: 'All other sessions have been logged out due to password change',
      } : undefined,
    })

    // Add security headers
    authMiddleware.addSecurityHeaders(response)

    return response
  } catch (error) {
    console.error('Update profile error:', error)

    // Record failed update attempt
    await RateLimiter.recordAttempt(request, 'profile_update', false, {
      failReason: 'Server error',
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid profile data',
          details: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Delete user account (requires password confirmation)
 */
export async function DELETE(request: NextRequest) {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
  const userAgent = request.headers.get('user-agent') || undefined

  try {
    // Validate authentication
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    const { user: authUser } = authResult
    
    if (!authUser) {
      return ApiResponseHandler.unauthorized('User not found')
    }
    
    // Parse request body for password confirmation
    const body = await request.json()
    const { password } = z.object({
      password: z.string().min(1, 'Password is required'),
      confirmDeletion: z.boolean().refine(val => val === true, {
        message: 'You must confirm account deletion',
      }),
    }).parse(body)

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        username: true,
        password: true,
        role: true,
      },
    })

    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'User not found or no password set' },
        { status: 404 }
      )
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Prevent admin self-deletion (optional business rule)
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      })
      
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last admin account' },
          { status: 403 }
        )
      }
    }

    // Blacklist current token and invalidate sessions before deletion
    await Promise.all([
      jwtService.blacklistToken(
        authMiddleware.extractToken(request) || '',
        'Account deletion',
        user.id
      ),
      sessionService.invalidateAllUserSessions(user.id),
    ])

    // Delete user account (cascade will handle related records)
    await prisma.user.delete({
      where: { id: user.id },
    })

    const response = NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
      deletedAt: new Date().toISOString(),
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
      httpOnly: false,
    })

    return response
  } catch (error) {
    console.error('Delete account error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}