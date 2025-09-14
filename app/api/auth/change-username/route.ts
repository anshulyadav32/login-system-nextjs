import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaUserService } from '@/services/user.service'
import { authMiddleware } from '@/middlewares/auth'
import { ApiResponseHandler } from '@/lib/api-response'
import { SecurityMiddleware } from '@/middlewares/security'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'

const responseHandler = new ApiResponseHandler()
const security = new SecurityMiddleware()

const changeUsernameSchema = z.object({
  newUsername: z.string()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .refine(val => !['admin', 'root', 'system', 'api', 'www'].includes(val.toLowerCase()), {
      message: 'This username is reserved'
    })
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request,
      'auth_change_username',
      RATE_LIMIT_CONFIGS.API_PROFILE_UPDATE
    )
    
    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(
        Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        'Too many username change attempts'
      )
    }

    // Security validation - simplified for now
    // TODO: Implement proper security validation when SecurityMiddleware.validateRequest is available

    // Validate authentication
    const authResult = await authMiddleware(request)
    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = changeUsernameSchema.safeParse(body)
    
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { newUsername: username } = validationResult.data
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown'

    // Check if username is already taken
    const existingUser = await PrismaUserService.findByUsername(username)
    if (existingUser && authResult.user && existingUser.id !== authResult.user.id) {
      console.warn(`Username change attempt with taken username: ${username} by user ${authResult.user.email} from IP: ${clientIP}`)
      return ApiResponseHandler.conflict('Username is already taken')
    }

    if (!authResult.user) {
      return ApiResponseHandler.unauthorized('User information not available')
    }

    // Update username in storage
    const updatedUser = await PrismaUserService.updateUser(authResult.user.id, {
      username: username
    })

    if (!updatedUser) {
      return ApiResponseHandler.internalError('Failed to update username')
    }

    console.log(`Username changed: ${authResult.user.email} changed username to ${username} from IP: ${clientIP}`)

    return ApiResponseHandler.success(
      {
        username: updatedUser.username,
        updatedAt: updatedUser.updatedAt.toISOString()
      },
      200
    )
  } catch (error) {
    console.error('Change username error:', error)
    
    if (error instanceof z.ZodError) {
      return ApiResponseHandler.validationError(error)
    }

    return ApiResponseHandler.internalError('Failed to change username')
  }
}