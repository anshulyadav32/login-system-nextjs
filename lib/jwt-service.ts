import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'
import type { RefreshToken } from '@prisma/client'

// JWT Configuration
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-jwt-secret-change-in-production'
)
const JWT_ISSUER = process.env.JWT_ISSUER || 'next-nuxt-app'
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'next-nuxt-users'

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m' // Short-term access token
const REFRESH_TOKEN_EXPIRY = '7d' // Long-term refresh token
const REMEMBER_ME_EXPIRY = '30d' // Extended session

export interface JWTClaims extends JWTPayload {
  sub: string // User ID
  email: string
  username: string
  role: string
  sessionId?: string
  tokenType: 'access' | 'refresh'
  authMethod?: 'credentials' | 'passkey' | 'oauth'
  deviceInfo?: string
  ipAddress?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiry: Date
  refreshTokenExpiry: Date
}

export class JWTService {
  /**
   * Generate a unique JWT ID (jti)
   */
  private static generateJTI(): string {
    return randomBytes(16).toString('hex')
  }

  /**
   * Hash a token for secure storage
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Generate access token with proper claims
   */
  static async generateAccessToken(
    payload: Omit<JWTClaims, 'tokenType' | 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
    options: {
      expiresIn?: string
      rememberMe?: boolean
    } = {}
  ): Promise<{ token: string; jti: string; expiresAt: Date }> {
    const jti = this.generateJTI()
    const expiresIn = options.rememberMe ? REMEMBER_ME_EXPIRY : (options.expiresIn || ACCESS_TOKEN_EXPIRY)
    
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.parseExpiry(expiresIn))

    const token = await new SignJWT({
      ...payload,
      tokenType: 'access' as const,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setJti(jti)
      .sign(JWT_SECRET)

    return { token, jti, expiresAt }
  }

  /**
   * Generate refresh token
   */
  static async generateRefreshToken(
    userId: string,
    options: {
      expiresIn?: string
      deviceInfo?: string
      ipAddress?: string
    } = {}
  ): Promise<{ token: string; expiresAt: Date; dbToken: RefreshToken }> {
    const jti = this.generateJTI()
    const expiresIn = options.expiresIn || REFRESH_TOKEN_EXPIRY
    
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.parseExpiry(expiresIn))

    const token = await new SignJWT({
      sub: userId,
      tokenType: 'refresh' as const,
      deviceInfo: options.deviceInfo,
      ipAddress: options.ipAddress,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setJti(jti)
      .sign(JWT_SECRET)

    // Store refresh token in database
    const dbToken = await prisma.refreshToken.create({
      data: {
        token: this.hashToken(token),
        userId,
        expiresAt,
      },
    })

    return { token, expiresAt, dbToken }
  }

  /**
   * Generate both access and refresh tokens
   */
  static async generateTokenPair(
    payload: Omit<JWTClaims, 'tokenType' | 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
    options: {
      rememberMe?: boolean
      deviceInfo?: string
      ipAddress?: string
    } = {}
  ): Promise<TokenPair> {
    const accessTokenResult = await this.generateAccessToken(payload, {
      rememberMe: options.rememberMe,
    })

    const refreshTokenResult = await this.generateRefreshToken(payload.sub as string, {
      deviceInfo: options.deviceInfo,
      ipAddress: options.ipAddress,
    })

    return {
      accessToken: accessTokenResult.token,
      refreshToken: refreshTokenResult.token,
      accessTokenExpiry: accessTokenResult.expiresAt,
      refreshTokenExpiry: refreshTokenResult.expiresAt,
    }
  }

  /**
   * Verify JWT token and return payload if valid
   */
  static async verifyToken(token: string): Promise<{ valid: boolean; payload?: JWTClaims; error?: string }> {
    try {
      // Check if token is blacklisted
      const tokenHash = this.hashToken(token)
      const blacklistedToken = await prisma.tokenBlacklist.findUnique({
        where: { tokenHash },
      })

      if (blacklistedToken) {
        return { valid: false, error: 'TOKEN_BLACKLISTED' }
      }

      const { payload } = await jwtVerify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      })

      return { valid: true, payload: payload as JWTClaims }
    } catch (error) {
      console.error('JWT verification failed:', error)
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'VERIFICATION_FAILED' 
      }
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      const verificationResult = await this.verifyToken(refreshToken)
      
      if (!verificationResult.valid || !verificationResult.payload || verificationResult.payload.tokenType !== 'refresh') {
        return null
      }

      const payload = verificationResult.payload

      // Check if refresh token exists in database and is not revoked
      const tokenHash = this.hashToken(refreshToken)
      const dbToken = await prisma.refreshToken.findFirst({
        where: {
          token: tokenHash,
          userId: payload.sub,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      })

      if (!dbToken) {
        return null
      }

      // Generate new token pair
      const newTokenPair = await this.generateTokenPair({
        sub: dbToken.user.id,
        email: dbToken.user.email,
        username: dbToken.user.username,
        role: dbToken.user.role,
        deviceInfo: payload.deviceInfo,
        ipAddress: payload.ipAddress,
      })

      // Revoke old refresh token
      await prisma.refreshToken.update({
        where: { id: dbToken.id },
        data: { isRevoked: true },
      })

      return newTokenPair
    } catch (error) {
      console.error('Token refresh failed:', error)
      return null
    }
  }

  /**
   * Blacklist a token (for logout or security purposes)
   */
  static async blacklistToken(
    token: string,
    reason: string = 'logout',
    userId?: string
  ): Promise<void> {
    try {
      const verificationResult = await this.verifyToken(token)
      if (!verificationResult.valid || !verificationResult.payload) return

      const payload = verificationResult.payload
      const tokenHash = this.hashToken(token)
      const expiresAt = new Date((payload.exp || 0) * 1000)

      await prisma.tokenBlacklist.create({
        data: {
          jti: payload.jti || '',
          userId: userId || payload.sub,
          tokenHash,
          reason,
          expiresAt,
        },
      })
    } catch (error) {
      console.error('Token blacklisting failed:', error)
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    })
  }

  /**
   * Clean up expired tokens and blacklisted entries
   */
  static async cleanupExpiredTokens(): Promise<void> {
    const now = new Date()
    
    // Remove expired blacklisted tokens
    await prisma.tokenBlacklist.deleteMany({
      where: { expiresAt: { lt: now } },
    })

    // Remove expired refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    })
  }

  /**
   * Parse expiry string to milliseconds
   */
  private static parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1)
    const value = parseInt(expiry.slice(0, -1))

    switch (unit) {
      case 's': return value * 1000
      case 'm': return value * 60 * 1000
      case 'h': return value * 60 * 60 * 1000
      case 'd': return value * 24 * 60 * 60 * 1000
      default: return 15 * 60 * 1000 // Default 15 minutes
    }
  }

  /**
   * Get token information without verification (for debugging)
   */
  static decodeTokenUnsafe(token: string): JWTClaims | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return null
      
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8')
      )
      
      return payload as JWTClaims
    } catch {
      return null
    }
  }
}

// Export singleton instance
export const jwtService = JWTService