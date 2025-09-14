import { NextRequest } from 'next/server'
import { prisma } from '../lib/prisma'

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxAttempts: number // Maximum attempts per window
  blockDurationMs?: number // How long to block after exceeding limit
  skipSuccessfulRequests?: boolean // Don't count successful requests
  keyGenerator?: (request: NextRequest) => string // Custom key generator
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: Date
  totalHits: number
  isBlocked?: boolean
  blockExpiresAt?: Date
}

// Tiered rate limit configurations based on endpoint criticality
export const RATE_LIMIT_CONFIGS = {
  // Critical Authentication endpoints (Tier 1 - Most Restrictive)
  AUTH_LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 5,
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
    skipSuccessfulRequests: true,
  },
  AUTH_REGISTER: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 3,
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
    skipSuccessfulRequests: true,
  },
  AUTH_FORGOT_PASSWORD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 3,
    blockDurationMs: 2 * 60 * 60 * 1000, // 2 hours block
    skipSuccessfulRequests: true,
  },
  AUTH_CHANGE_PASSWORD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 5,
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
    skipSuccessfulRequests: true,
  },
  
  // Standard Authentication endpoints (Tier 2)
  AUTH_LOGOUT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 10,
  },
  AUTH_REFRESH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 20,
  },
  AUTH_PROFILE: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 30,
  },
  
  // Sensitive API endpoints (Tier 2)
  API_ADMIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 20,
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  API_USER_MANAGEMENT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 30,
  },
  API_PROFILE_UPDATE: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 10,
  },
  
  // General API endpoints (Tier 3)
  API_GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 100,
  },
  API_UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 10,
  },
  API_READ_ONLY: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 200,
  },
  API_HEALTH_CHECK: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxAttempts: 60, // 1 per second
  },
  
  // Admin endpoints
  ADMIN_ACTIONS: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxAttempts: 20,
  },
  
  // User-based configurations (Tier 4 - Most Permissive)
  AUTHENTICATED_USER: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 300,
  },
  PREMIUM_USER: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 500,
  },
  ADMIN_USER: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 1000,
  },
} as const

// IP reputation tracking
interface IPReputation {
  score: number // 0-100, lower is worse
  lastViolation?: number
  violationCount: number
  whitelisted: boolean
  blacklisted: boolean
}

// Enhanced rate limit result
interface EnhancedRateLimitResult extends RateLimitResult {
  remainingTime?: number
  ipReputation?: number
  tier: string
}

export class RateLimiter {
  private static ipReputations: Map<string, IPReputation> = new Map()
  private static whitelistedIPs: Set<string> = new Set()
  private static blacklistedIPs: Set<string> = new Set()

  static {
    // Initialize whitelisted IPs from environment
    const whitelisted = process.env.WHITELISTED_IPS?.split(',') || []
    whitelisted.forEach(ip => this.whitelistedIPs.add(ip.trim()))
    
    // Initialize blacklisted IPs from environment
    const blacklisted = process.env.BLACKLISTED_IPS?.split(',') || []
    blacklisted.forEach(ip => this.blacklistedIPs.add(ip.trim()))
  }
  /**
   * Generate rate limit key from request
   */
  private static generateKey(
    request: NextRequest,
    prefix: string,
    keyGenerator?: (request: NextRequest) => string
  ): string {
    if (keyGenerator) {
      return `${prefix}:${keyGenerator(request)}`
    }

    // Default: use IP address
    const ip = this.getClientIP(request)
    return `${prefix}:${ip}`
  }

  /**
   * Get client IP address
   */
  private static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const clientIP = request.headers.get('x-client-ip')
    
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    
    return realIP || clientIP || 'unknown'
  }

  /**
   * Get IP reputation score
   */
  static getIPReputation(ip: string): IPReputation {
    if (!this.ipReputations.has(ip)) {
      this.ipReputations.set(ip, {
        score: 100, // Start with perfect score
        violationCount: 0,
        whitelisted: this.whitelistedIPs.has(ip),
        blacklisted: this.blacklistedIPs.has(ip)
      })
    }
    return this.ipReputations.get(ip)!
  }

  /**
   * Update IP reputation based on behavior
   */
  static updateIPReputation(ip: string, violation: boolean = false): void {
    const reputation = this.getIPReputation(ip)
    
    if (violation) {
      reputation.violationCount++
      reputation.lastViolation = Date.now()
      // Decrease score based on violation severity
      reputation.score = Math.max(0, reputation.score - (10 + reputation.violationCount * 2))
      
      // Auto-blacklist IPs with very low reputation
      if (reputation.score <= 10 && reputation.violationCount >= 10) {
        reputation.blacklisted = true
        this.blacklistedIPs.add(ip)
      }
    } else {
      // Slowly improve reputation for good behavior
      reputation.score = Math.min(100, reputation.score + 0.5)
    }
    
    this.ipReputations.set(ip, reputation)
  }

  /**
   * Get appropriate rate limit config based on user status and IP reputation
   */
  static getAdaptiveConfig(
    baseConfig: RateLimitConfig,
    userRole?: string,
    ipReputation?: number
  ): RateLimitConfig {
    let multiplier = 1
    
    // Adjust based on user role
    switch (userRole) {
      case 'admin':
      case 'super_admin':
        multiplier *= 3
        break
      case 'premium':
        multiplier *= 2
        break
      case 'authenticated':
        multiplier *= 1.5
        break
    }
    
    // Adjust based on IP reputation
    if (ipReputation !== undefined) {
      if (ipReputation >= 90) {
        multiplier *= 1.2 // Bonus for good IPs
      } else if (ipReputation <= 30) {
        multiplier *= 0.5 // Penalty for bad IPs
      } else if (ipReputation <= 10) {
        multiplier *= 0.1 // Severe penalty for very bad IPs
      }
    }
    
    return {
      ...baseConfig,
      maxAttempts: Math.floor(baseConfig.maxAttempts * multiplier)
    }
  }

  /**
   * Check rate limit for a request
   */
  static async checkRateLimit(
    request: NextRequest,
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = new Date()
    const windowStart = new Date(now.getTime() - config.windowMs)
    const ipAddress = this.getClientIP(request)

    try {
      // Check if IP is currently blocked
      const existingBlock = await prisma.loginAttempt.findFirst({
        where: {
          ipAddress,
          success: false,
          createdAt: {
            gte: new Date(now.getTime() - (config.blockDurationMs || 0)),
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Count attempts in current window
      const attempts = await prisma.loginAttempt.count({
        where: {
          ipAddress,
          createdAt: { gte: windowStart },
          ...(config.skipSuccessfulRequests ? { success: false } : {}),
        },
      })

      const remaining = Math.max(0, config.maxAttempts - attempts)
      const resetTime = new Date(windowStart.getTime() + config.windowMs)

      // Check if blocked
      if (config.blockDurationMs && existingBlock) {
        const blockCount = await prisma.loginAttempt.count({
          where: {
            ipAddress,
            success: false,
            createdAt: {
              gte: new Date(existingBlock.createdAt.getTime() - config.windowMs),
              lte: existingBlock.createdAt,
            },
          },
        })

        if (blockCount >= config.maxAttempts) {
          const blockExpiresAt = new Date(
            existingBlock.createdAt.getTime() + config.blockDurationMs
          )

          if (now < blockExpiresAt) {
            return {
              allowed: false,
              remaining: 0,
              resetTime: blockExpiresAt,
              totalHits: attempts,
              isBlocked: true,
              blockExpiresAt,
            }
          }
        }
      }

      const allowed = attempts < config.maxAttempts

      return {
        allowed,
        remaining,
        resetTime,
        totalHits: attempts,
        isBlocked: false,
      }
    } catch (error) {
      console.error('Rate limit check failed:', error)
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remaining: config.maxAttempts,
        resetTime: new Date(now.getTime() + config.windowMs),
        totalHits: 0,
      }
    }
  }

  /**
   * Record an attempt (for rate limiting)
   */
  static async recordAttempt(
    request: NextRequest,
    identifier: string,
    success: boolean,
    metadata?: {
      email?: string
      username?: string
      userId?: string
      failReason?: string
    }
  ): Promise<void> {
    const ipAddress = this.getClientIP(request)
    const userAgent = request.headers.get('user-agent') || undefined

    try {
      await prisma.loginAttempt.create({
        data: {
          ipAddress,
          userAgent,
          success,
          email: metadata?.email,
          username: metadata?.username,
          userId: metadata?.userId,
          failReason: metadata?.failReason,
        },
      })
    } catch (error) {
      console.error('Failed to record attempt:', error)
    }
  }

  /**
   * Clean up old rate limit records
   */
  static async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanMs)
    
    try {
      await prisma.loginAttempt.deleteMany({
        where: {
          createdAt: { lt: cutoff },
        },
      })
    } catch (error) {
      console.error('Rate limit cleanup failed:', error)
    }
  }

  /**
   * Get rate limit stats for an IP
   */
  static async getStats(
    request: NextRequest,
    windowMs: number = 60 * 60 * 1000
  ): Promise<{
    totalAttempts: number
    successfulAttempts: number
    failedAttempts: number
    lastAttempt: Date | null
    isCurrentlyBlocked: boolean
  }> {
    const ipAddress = this.getClientIP(request)
    const windowStart = new Date(Date.now() - windowMs)

    try {
      const [totalAttempts, successfulAttempts, lastAttempt] = await Promise.all([
        prisma.loginAttempt.count({
          where: {
            ipAddress,
            createdAt: { gte: windowStart },
          },
        }),
        prisma.loginAttempt.count({
          where: {
            ipAddress,
            success: true,
            createdAt: { gte: windowStart },
          },
        }),
        prisma.loginAttempt.findFirst({
          where: { ipAddress },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ])

      const failedAttempts = totalAttempts - successfulAttempts

      // Check if currently blocked (simplified check)
      const recentFailures = await prisma.loginAttempt.count({
        where: {
          ipAddress,
          success: false,
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
          },
        },
      })

      return {
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        lastAttempt: lastAttempt?.createdAt || null,
        isCurrentlyBlocked: recentFailures >= 5, // Simple threshold
      }
    } catch (error) {
      console.error('Failed to get rate limit stats:', error)
      return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        lastAttempt: null,
        isCurrentlyBlocked: false,
      }
    }
  }

  /**
   * Middleware wrapper for rate limiting
   */
  static withRateLimit(
    identifier: string,
    config: RateLimitConfig,
    handler: (request: NextRequest) => Promise<Response>
  ) {
    return async (request: NextRequest): Promise<Response> => {
      const rateLimitResult = await this.checkRateLimit(request, identifier, config)

      if (!rateLimitResult.allowed) {
        const response = new Response(
          JSON.stringify({
            error: rateLimitResult.isBlocked 
              ? 'IP address is temporarily blocked due to too many failed attempts'
              : 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(
              (rateLimitResult.resetTime.getTime() - Date.now()) / 1000
            ),
            ...(rateLimitResult.blockExpiresAt && {
              blockExpiresAt: rateLimitResult.blockExpiresAt.toISOString(),
            }),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil(
                (rateLimitResult.resetTime.getTime() - Date.now()) / 1000
              ).toString(),
              'X-RateLimit-Limit': config.maxAttempts.toString(),
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': rateLimitResult.resetTime.toISOString(),
            },
          }
        )

        return response
      }

      // Add rate limit headers to successful responses
      const response = await handler(request)
      
      response.headers.set('X-RateLimit-Limit', config.maxAttempts.toString())
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
      response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toISOString())

      return response
    }
  }

  /**
   * Whitelist an IP address (remove from rate limiting)
   */
  static async whitelistIP(
    ipAddress: string,
    reason: string = 'Manual whitelist'
  ): Promise<void> {
    try {
      // Remove recent failed attempts for this IP
      await prisma.loginAttempt.deleteMany({
        where: {
          ipAddress,
          success: false,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      })

      console.log(`IP ${ipAddress} whitelisted: ${reason}`)
    } catch (error) {
      console.error('Failed to whitelist IP:', error)
    }
  }
}

// Export singleton instance
export const rateLimiter = RateLimiter