import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'
import { jwtService } from './jwt-service'

// Session configuration
const SESSION_COOKIE_NAME = 'session-token'
const CSRF_COOKIE_NAME = 'csrf-token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const SESSION_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours

export interface SessionData {
  id: string
  userId: string
  sessionToken: string
  expires: Date
  ipAddress?: string
  userAgent?: string
  deviceInfo?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateSessionOptions {
  userId: string
  ipAddress?: string
  userAgent?: string
  deviceInfo?: string
  rememberMe?: boolean
}

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  maxAge?: number
  path?: string
  domain?: string
}

export class SessionService {
  /**
   * Generate a secure session token
   */
  private static generateSessionToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Generate CSRF token
   */
  private static generateCSRFToken(): string {
    return randomBytes(32).toString('base64url')
  }

  /**
   * Hash session token for database storage
   */
  private static hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Get device info from user agent
   */
  private static parseDeviceInfo(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device'
    
    // Simple device detection
    if (userAgent.includes('Mobile')) return 'Mobile Device'
    if (userAgent.includes('Tablet')) return 'Tablet'
    if (userAgent.includes('Windows')) return 'Windows PC'
    if (userAgent.includes('Mac')) return 'Mac'
    if (userAgent.includes('Linux')) return 'Linux PC'
    
    return 'Unknown Device'
  }

  /**
   * Get secure cookie options based on environment
   */
  private static getCookieOptions(maxAge?: number): CookieOptions {
    const isProduction = process.env.NODE_ENV === 'production'
    
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: maxAge || SESSION_EXPIRY / 1000, // Convert to seconds
      path: '/',
      // domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
    }
  }

  /**
   * Create a new session
   */
  static async createSession(
    options: CreateSessionOptions
  ): Promise<{ session: SessionData; sessionToken: string; csrfToken: string }> {
    const sessionToken = this.generateSessionToken()
    const csrfToken = this.generateCSRFToken()
    const hashedToken = this.hashSessionToken(sessionToken)
    
    const expiryTime = options.rememberMe 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      : new Date(Date.now() + SESSION_EXPIRY) // 24 hours

    const deviceInfo = this.parseDeviceInfo(options.userAgent)

    const session = await prisma.session.create({
      data: {
        sessionToken: hashedToken,
        userId: options.userId,
        expires: expiryTime,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        deviceInfo,
        isActive: true,
      },
    })

    return {
      session: {
        ...session,
        ipAddress: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
        deviceInfo: session.deviceInfo ?? undefined,
      },
      sessionToken,
      csrfToken,
    }
  }

  /**
   * Validate session token
   */
  static async validateSession(sessionToken: string): Promise<SessionData | null> {
    try {
      const hashedToken = this.hashSessionToken(sessionToken)
      
      const session = await prisma.session.findUnique({
        where: {
          sessionToken: hashedToken,
        },
      })

      if (!session || !session.isActive || session.expires < new Date()) {
        return null
      }

      // Update last accessed time
      await prisma.session.update({
        where: { id: session.id },
        data: { updatedAt: new Date() },
      })

      return {
        ...session,
        ipAddress: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
        deviceInfo: session.deviceInfo ?? undefined,
      }
    } catch (error) {
      console.error('Session validation failed:', error)
      return null
    }
  }

  /**
   * Refresh session expiry
   */
  static async refreshSession(
    sessionToken: string,
    extendBy?: number
  ): Promise<SessionData | null> {
    try {
      const hashedToken = this.hashSessionToken(sessionToken)
      const newExpiry = new Date(Date.now() + (extendBy || SESSION_EXPIRY))

      const session = await prisma.session.update({
        where: {
          sessionToken: hashedToken,
          isActive: true,
        },
        data: {
          expires: newExpiry,
          updatedAt: new Date(),
        },
      })

      return {
        ...session,
        ipAddress: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
        deviceInfo: session.deviceInfo ?? undefined,
      }
    } catch (error) {
      console.error('Session refresh failed:', error)
      return null
    }
  }

  /**
   * Invalidate a session
   */
  static async invalidateSession(sessionToken: string): Promise<void> {
    try {
      const hashedToken = this.hashSessionToken(sessionToken)
      
      await prisma.session.update({
        where: { sessionToken: hashedToken },
        data: { isActive: false },
      })
    } catch (error) {
      console.error('Session invalidation failed:', error)
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    })
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<void> {
    await prisma.session.deleteMany({
      where: {
        expires: { lt: new Date() },
      },
    })
  }

  /**
   * Set session cookies in response
   */
  static setSessionCookies(
    response: NextResponse,
    sessionToken: string,
    csrfToken: string,
    options: { rememberMe?: boolean } = {}
  ): void {
    const cookieOptions = this.getCookieOptions(
      options.rememberMe ? 30 * 24 * 60 * 60 : undefined // 30 days or default
    )

    // Set session cookie (HTTP-only)
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, cookieOptions)

    // Set CSRF token cookie (accessible to JavaScript for headers)
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      ...cookieOptions,
      httpOnly: false, // CSRF token needs to be accessible to JS
    })
  }

  /**
   * Clear session cookies
   */
  static clearSessionCookies(response: NextResponse): void {
    const cookieOptions = this.getCookieOptions(0) // Expire immediately
    
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...cookieOptions,
      maxAge: 0,
    })
    
    response.cookies.set(CSRF_COOKIE_NAME, '', {
      ...cookieOptions,
      maxAge: 0,
      httpOnly: false,
    })
  }

  /**
   * Extract session token from request
   */
  static getSessionTokenFromRequest(request: NextRequest): string | null {
    return request.cookies.get(SESSION_COOKIE_NAME)?.value || null
  }

  /**
   * Extract CSRF token from request
   */
  static getCSRFTokenFromRequest(request: NextRequest): {
    cookieToken: string | null
    headerToken: string | null
  } {
    return {
      cookieToken: request.cookies.get(CSRF_COOKIE_NAME)?.value || null,
      headerToken: request.headers.get(CSRF_HEADER_NAME) || null,
    }
  }

  /**
   * Validate CSRF token
   */
  static validateCSRFToken(request: NextRequest): boolean {
    const { cookieToken, headerToken } = this.getCSRFTokenFromRequest(request)
    
    // Skip CSRF validation for GET requests
    if (request.method === 'GET') {
      return true
    }

    // Both tokens must exist and match
    return cookieToken !== null && headerToken !== null && cookieToken === headerToken
  }

  /**
   * Get user sessions with metadata
   */
  static async getUserSessions(userId: string): Promise<SessionData[]> {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        isActive: true,
        expires: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    })
    
    return sessions.map(session => ({
      ...session,
      ipAddress: session.ipAddress ?? undefined,
      userAgent: session.userAgent ?? undefined,
      deviceInfo: session.deviceInfo ?? undefined,
    }))
  }

  /**
   * Get session statistics
   */
  static async getSessionStats(userId: string): Promise<{
    activeSessions: number
    totalSessions: number
    lastLoginAt: Date | null
    deviceTypes: Record<string, number>
  }> {
    const [activeSessions, totalSessions, lastSession, allSessions] = await Promise.all([
      prisma.session.count({
        where: {
          userId,
          isActive: true,
          expires: { gt: new Date() },
        },
      }),
      prisma.session.count({
        where: { userId },
      }),
      prisma.session.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.session.findMany({
        where: {
          userId,
          isActive: true,
          expires: { gt: new Date() },
        },
        select: { deviceInfo: true },
      }),
    ])

    const deviceTypes = allSessions.reduce((acc, session) => {
      const device = session.deviceInfo || 'Unknown'
      acc[device] = (acc[device] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      activeSessions,
      totalSessions,
      lastLoginAt: lastSession?.createdAt || null,
      deviceTypes,
    }
  }

  /**
   * Create session with JWT integration
   */
  static async createSessionWithJWT(
    options: CreateSessionOptions & {
      user: {
        id: string
        email: string
        username: string
        role: string
      }
      authMethod?: 'credentials' | 'passkey' | 'oauth'
    }
  ): Promise<{
    session: SessionData
    sessionToken: string
    csrfToken: string
    accessToken: string
    refreshToken: string
  }> {
    // Create session
    const { session, sessionToken, csrfToken } = await this.createSession(options)

    // Generate JWT tokens
    const tokenPair = await jwtService.generateTokenPair(
      {
        sub: options.user.id,
        email: options.user.email,
        username: options.user.username,
        role: options.user.role,
        sessionId: session.id,
        authMethod: options.authMethod || 'credentials',
        deviceInfo: options.deviceInfo,
        ipAddress: options.ipAddress,
      },
      {
        rememberMe: options.rememberMe,
        deviceInfo: options.deviceInfo,
        ipAddress: options.ipAddress,
      }
    )

    return {
      session,
      sessionToken,
      csrfToken,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    }
  }
}

// Export singleton instance
export const sessionService = SessionService