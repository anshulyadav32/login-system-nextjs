import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

// Security configuration
export interface SecurityConfig {
  enforceHttps?: boolean
  enableCSP?: boolean
  enableCSRF?: boolean
  enableHSTS?: boolean
  enableXSSProtection?: boolean
  enableFrameOptions?: boolean
  enableContentTypeOptions?: boolean
  enableReferrerPolicy?: boolean
  trustedDomains?: string[]
  csrfExemptPaths?: string[]
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enforceHttps: process.env.NODE_ENV === 'production',
  enableCSP: true,
  enableCSRF: true,
  enableHSTS: true,
  enableXSSProtection: true,
  enableFrameOptions: true,
  enableContentTypeOptions: true,
  enableReferrerPolicy: true,
  trustedDomains: [
    'https://nuxtjs-frontend.vercel.app',
    'https://nextjs-backend-flame.vercel.app',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
  ],
  csrfExemptPaths: [
    '/api/health',
    '/api/status',
    '/api/auth/register',
    '/api/auth/secure-login'
  ]
}

export class SecurityMiddleware {
  private config: SecurityConfig
  private csrfTokens = new Map<string, { token: string; expires: number }>()

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config }
  }

  /**
   * Apply all security headers and checks
   */
  async applySecurityHeaders(
    request: NextRequest,
    response: NextResponse
  ): Promise<NextResponse> {
    // Enforce HTTPS in production
    if (this.config.enforceHttps && this.shouldEnforceHttps(request)) {
      return this.redirectToHttps(request)
    }

    // Apply security headers
    this.setSecurityHeaders(response)

    // CSRF protection for state-changing operations
    if (this.config.enableCSRF && this.requiresCSRFProtection(request)) {
      const csrfResult = await this.validateCSRF(request)
      if (!csrfResult.valid) {
        return NextResponse.json(
          { 
            success: false, 
            error: { 
              code: 'CSRF_TOKEN_INVALID', 
              message: 'CSRF token validation failed',
              timestamp: new Date().toISOString()
            } 
          },
          { status: 403 }
        )
      }
    }

    return response
  }

  /**
   * Set comprehensive security headers
   */
  private setSecurityHeaders(response: NextResponse): void {
    // Content Security Policy
    if (this.config.enableCSP) {
      const csp = this.buildCSPHeader()
      response.headers.set('Content-Security-Policy', csp)
    }

    // HTTP Strict Transport Security
    if (this.config.enableHSTS) {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      )
    }

    // X-Frame-Options
    if (this.config.enableFrameOptions) {
      response.headers.set('X-Frame-Options', 'DENY')
    }

    // X-Content-Type-Options
    if (this.config.enableContentTypeOptions) {
      response.headers.set('X-Content-Type-Options', 'nosniff')
    }

    // X-XSS-Protection
    if (this.config.enableXSSProtection) {
      response.headers.set('X-XSS-Protection', '1; mode=block')
    }

    // Referrer Policy
    if (this.config.enableReferrerPolicy) {
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    }

    // Additional security headers
    response.headers.set('X-DNS-Prefetch-Control', 'off')
    response.headers.set('X-Download-Options', 'noopen')
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
  }

  /**
   * Build Content Security Policy header
   */
  private buildCSPHeader(): string {
    const trustedDomains = this.config.trustedDomains?.join(' ') || "'self'"
    
    return [
      "default-src 'self'",
      `connect-src 'self' ${trustedDomains}`,
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: Consider removing unsafe-* in production
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ].join('; ')
  }

  /**
   * Check if HTTPS should be enforced
   */
  private shouldEnforceHttps(request: NextRequest): boolean {
    const protocol = request.headers.get('x-forwarded-proto') || 
                    request.nextUrl.protocol
    return protocol !== 'https:'
  }

  /**
   * Redirect to HTTPS
   */
  private redirectToHttps(request: NextRequest): NextResponse {
    const httpsUrl = request.nextUrl.clone()
    httpsUrl.protocol = 'https:'
    return NextResponse.redirect(httpsUrl, 301)
  }

  /**
   * Check if request requires CSRF protection
   */
  private requiresCSRFProtection(request: NextRequest): boolean {
    // Only protect state-changing methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return false
    }

    // Check if path is exempt from CSRF protection
    const pathname = request.nextUrl.pathname
    return !this.config.csrfExemptPaths?.some(path => pathname.startsWith(path))
  }

  /**
   * Validate CSRF token
   */
  private async validateCSRF(request: NextRequest): Promise<{ valid: boolean; error?: string }> {
    const token = request.headers.get('X-CSRF-Token') || 
                 request.headers.get('X-Requested-With')
    
    if (!token) {
      return { valid: false, error: 'CSRF token missing' }
    }

    // For API requests, we can use a simpler approach
    // In a full implementation, you'd want to store and validate actual tokens
    const sessionId = this.extractSessionId(request)
    if (!sessionId) {
      return { valid: false, error: 'Session required for CSRF validation' }
    }

    // Validate token format and expiry
    const storedToken = this.csrfTokens.get(sessionId)
    if (!storedToken || storedToken.expires < Date.now()) {
      return { valid: false, error: 'CSRF token expired or invalid' }
    }

    if (storedToken.token !== token) {
      return { valid: false, error: 'CSRF token mismatch' }
    }

    return { valid: true }
  }

  /**
   * Generate CSRF token for a session
   */
  generateCSRFToken(sessionId: string): string {
    const token = randomBytes(32).toString('hex')
    const expires = Date.now() + (60 * 60 * 1000) // 1 hour
    
    this.csrfTokens.set(sessionId, { token, expires })
    
    // Clean up expired tokens periodically
    this.cleanupExpiredTokens()
    
    return token
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(request: NextRequest): string | null {
    // Try to get session ID from various sources
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      // Extract from JWT token (simplified)
      return createHash('sha256').update(authHeader).digest('hex').substring(0, 16)
    }

    const sessionCookie = request.cookies.get('session-token')?.value
    if (sessionCookie) {
      return createHash('sha256').update(sessionCookie).digest('hex').substring(0, 16)
    }

    return null
  }

  /**
   * Clean up expired CSRF tokens
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now()
    for (const [sessionId, tokenData] of this.csrfTokens.entries()) {
      if (tokenData.expires < now) {
        this.csrfTokens.delete(sessionId)
      }
    }
  }

  /**
   * Validate request origin
   */
  validateOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin')
    if (!origin) {
      // Allow same-origin requests (no origin header)
      return true
    }

    return this.config.trustedDomains?.includes(origin) || false
  }

  /**
   * Rate limiting based on IP and user
   */
  async checkSecurityRateLimit(
    request: NextRequest,
    identifier: string,
    maxRequests: number = 100,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
  ): Promise<{ allowed: boolean; remaining: number }> {
    // This is a simplified implementation
    // In production, you'd want to use Redis or a proper rate limiting service
    const key = `security_rate_limit:${identifier}`
    
    // For now, return allowed (implement with your preferred storage)
    return { allowed: true, remaining: maxRequests }
  }
}

// Export singleton instance
export const securityMiddleware = new SecurityMiddleware()

// Export utility functions
export function createSecurityMiddleware(config?: Partial<SecurityConfig>) {
  return new SecurityMiddleware(config)
}