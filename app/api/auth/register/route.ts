import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaUserService } from '@/services/user.service'
import { ApiResponseHandler } from '@/lib/api-response'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'
import { SecurityMiddleware } from '@/middlewares/security'

const responseHandler = new ApiResponseHandler()
const security = new SecurityMiddleware()

// Enhanced user registration validation schema
const registerSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .refine(email => {
      // Basic email domain validation
      const domain = email.split('@')[1]
      return domain && domain.includes('.') && domain.length > 3
    }, 'Invalid email domain'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .refine(username => {
      // Reserved usernames
      const reserved = ['admin', 'root', 'system', 'api', 'www', 'mail', 'support']
      return !reserved.includes(username.toLowerCase())
    }, 'Username is reserved'),
  firstName: z.string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  role: z.enum(['user']).default('user'), // Only allow user role for public registration
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions'),
  acceptPrivacy: z.boolean().refine(val => val === true, 'You must accept the privacy policy'),
  marketingConsent: z.boolean().optional().default(false)
})

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request, 
      'auth_register',
      RATE_LIMIT_CONFIGS.AUTH_REGISTER
    )
    
    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(
        Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        'Too many registration attempts'
      )
    }

    // Security validation
    // Security validation - simplified for now
    // TODO: Implement proper security validation when SecurityMiddleware.validateRequest is available

    // Parse and validate request body
    const body = await request.json()
    const validationResult = registerSchema.safeParse(body)
    
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { email, password, username, firstName, lastName, role, marketingConsent } = validationResult.data
    // Check for existing user with same email or username
    const existingUserByEmail = await PrismaUserService.findByEmail(email)
    if (existingUserByEmail) {
      return ApiResponseHandler.conflict('Email is already registered')
    }
    
    const existingUserByUsername = await PrismaUserService.findByUsername(username)
    if (existingUserByUsername) {
      return ApiResponseHandler.conflict('Username is already taken')
    }

    // Get client information for audit trail
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'Unknown'

    // Create user with enhanced data
    const user = await PrismaUserService.createUser({
      email,
      password,
      username,
      role,
    })

    // Log successful registration
    console.log(`New user registered: ${username} (${email}) from IP: ${clientIP}`)

    return ApiResponseHandler.success({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      },
      nextSteps: [
        'Please check your email for verification instructions',
        'You can now sign in with your credentials'
      ]
    }, 201)

  } catch (error) {
    console.error('Registration error:', error)
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        return ApiResponseHandler.conflict('Email or username is already registered')
      }
      if (error.message.includes('Invalid input')) {
        return ApiResponseHandler.error('INVALID_INPUT', 'Invalid registration data provided', 400)
      }
    }
    
    return ApiResponseHandler.internalError('Registration failed. Please try again later.')
  }
}
