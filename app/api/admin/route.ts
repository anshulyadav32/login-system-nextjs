import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaUserService } from '@/services/user.service'
import { authMiddleware } from '@/middlewares/auth'
import { ApiResponseHandler } from '@/lib/api-response'
import { RateLimiter, RATE_LIMIT_CONFIGS } from '@/middlewares/rate-limit'

const responseHandler = new ApiResponseHandler()

// Admin query schema
const adminQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).optional().default('month'),
  includeInactive: z.boolean().optional().default(false),
  limit: z.number().min(1).max(1000).optional().default(100)
})

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await RateLimiter.checkRateLimit(
      request, 
      'admin',
      RATE_LIMIT_CONFIGS.API_ADMIN
    )
    
    if (!rateLimitResult.allowed) {
      return ApiResponseHandler.rateLimitExceeded(
        Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000),
        'Too many admin requests'
      )
    }

    // Authenticate and authorize admin access
    const authResult = await authMiddleware(request)

    if (!authResult.authenticated) {
      return ApiResponseHandler.unauthorized('Authentication required')
    }

    // Check admin role authorization
    if (!authResult.user || !['admin', 'super_admin'].includes(authResult.user.role)) {
      return ApiResponseHandler.forbidden('Admin access required')
    }

    // Validate query parameters
    const url = new URL(request.url)
    const queryParams = {
      period: url.searchParams.get('period') || 'month',
      includeInactive: url.searchParams.get('includeInactive') === 'true',
      limit: parseInt(url.searchParams.get('limit') || '100')
    }

    const validationResult = adminQuerySchema.safeParse(queryParams)
    if (!validationResult.success) {
      return ApiResponseHandler.validationError(validationResult.error)
    }

    const { period, includeInactive, limit } = validationResult.data
    const userService = new PrismaUserService()
    
    // Calculate period in days
    const periodDays = {
      day: 1,
      week: 7,
      month: 30,
      year: 365
    }[period]
    
    // Get user statistics
    const userStats = await PrismaUserService.getUserStats()
    const allUsers = await PrismaUserService.getAllUsers()

    const stats = {
      totalUsers: userStats.totalUsers,
      activeUsers: userStats.totalUsers, // Simplified - all users considered active
      inactiveUsers: 0,
      newUsers: {
        count: 0, // Simplified - would need additional logic to calculate
        period: period
      },
      usersByRole: {
        adminUsers: userStats.adminUsers,
        regularUsers: userStats.regularUsers
      },
      recentUsers: allUsers.slice(0, limit).map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }))
    }

    return ApiResponseHandler.success({
      user: {
        id: authResult.user?.id,
        username: authResult.user?.username,
        role: authResult.user?.role
      },
      stats,
      metadata: {
        period,
        includeInactive,
        limit,
        generatedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Admin route error:', error)
    return ApiResponseHandler.internalError('Failed to fetch admin data')
  }
}
