import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { corsMiddleware } from './middlewares/cors'
import { SecurityMiddleware } from './middlewares/security'
import { RateLimiter, RATE_LIMIT_CONFIGS } from './middlewares/rate-limit'
import { ApiResponseHandler } from './lib/api-response'

// Initialize middleware instances
const cors = corsMiddleware
const security = new SecurityMiddleware()
const responseHandler = new ApiResponseHandler()

// Enhanced middleware with comprehensive security
async function enhancedMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Handle CORS preflight requests first
  const preflightResponse = cors.handlePreflightRequest(request)
  if (preflightResponse) {
    return await security.applySecurityHeaders(request, preflightResponse)
  }
  
  // Validate CORS for actual requests
  const corsValidation = cors.validateCorsRequest(request)
  if (!corsValidation.valid) {
    return ApiResponseHandler.forbidden(corsValidation.error || 'CORS validation failed')
  }
  
  // Apply security headers and validations
  const securityResponse = await security.applySecurityHeaders(request, NextResponse.next())
  if (securityResponse.status === 403) {
    return securityResponse
  }
  
  // Apply rate limiting based on endpoint
  const rateLimitConfig = getRateLimitConfig(pathname)
  if (rateLimitConfig) {
    const identifier = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const rateLimitResult = await RateLimiter.checkRateLimit(request, identifier, rateLimitConfig)
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
      const response = ApiResponseHandler.rateLimitExceeded(
        retryAfter > 0 ? retryAfter : undefined,
        'Rate limit exceeded'
      )
      
      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', rateLimitConfig.maxAttempts.toString())
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
      response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString())
      
      return security.applySecurityHeaders(request, response)
    }
  }
  
  // Continue with the request
  const response = NextResponse.next()
  
  // Apply CORS headers
  const corsResponse = cors.applyCorsHeaders(request, response)
  
  // Apply security headers
  return security.applySecurityHeaders(request, corsResponse)
}

// Get appropriate rate limit configuration based on pathname
function getRateLimitConfig(pathname: string) {
  // Authentication endpoints
  if (pathname.includes('/api/auth/login')) {
    return RATE_LIMIT_CONFIGS.AUTH_LOGIN
  }
  if (pathname.includes('/api/auth/register')) {
    return RATE_LIMIT_CONFIGS.AUTH_REGISTER
  }
  if (pathname.includes('/api/auth/forgot-password')) {
    return RATE_LIMIT_CONFIGS.AUTH_FORGOT_PASSWORD
  }
  if (pathname.includes('/api/auth/profile')) {
    return RATE_LIMIT_CONFIGS.AUTH_PROFILE
  }
  if (pathname.includes('/api/auth/logout')) {
    return RATE_LIMIT_CONFIGS.AUTH_LOGOUT
  }
  if (pathname.includes('/api/auth/refresh')) {
    return RATE_LIMIT_CONFIGS.AUTH_REFRESH
  }
  
  // Admin endpoints
  if (pathname.includes('/api/admin')) {
    return RATE_LIMIT_CONFIGS.API_ADMIN
  }
  
  // Health check endpoints
  if (pathname.includes('/api/health') || pathname.includes('/api/status')) {
    return RATE_LIMIT_CONFIGS.API_HEALTH_CHECK
  }
  
  // Profile update endpoints
  if (pathname.includes('/api/profile') && pathname.includes('PUT')) {
    return RATE_LIMIT_CONFIGS.API_PROFILE_UPDATE
  }
  
  // General API endpoints
  if (pathname.startsWith('/api/')) {
    return RATE_LIMIT_CONFIGS.API_GENERAL
  }
  
  return null
}

export default enhancedMiddleware

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/((?!health|test|status|auth/passkey).)*"], // protect dashboard, admin routes and handle CORS for API routes, allow passkey endpoints, root path is public
}
