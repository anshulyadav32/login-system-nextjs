import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jwtService } from '@/lib/jwt-service'
import { ApiResponseHandler } from '@/lib/api-response'

/**
 * Test utilities for backend API testing
 */
export class TestHelpers {

  /**
   * Create a mock NextRequest for testing
   */
  static createMockRequest(
    methodOrOptions: string | {
      method?: string
      url?: string
      headers?: Record<string, string>
      body?: any
      cookies?: Record<string, string>
    } = {},
    url?: string,
    body?: any,
    headers?: Record<string, string>
  ): NextRequest {
    let options: {
      method: string
      url: string
      headers: Record<string, string>
      body: any
      cookies: Record<string, string>
    }

    if (typeof methodOrOptions === 'string') {
      // Called with individual parameters
      const baseUrl = 'http://localhost:3000'
      const fullUrl = url?.startsWith('http') ? url : `${baseUrl}${url || '/api/test'}`
      options = {
        method: methodOrOptions,
        url: fullUrl,
        headers: headers || {},
        body,
        cookies: {}
      }
    } else {
      // Called with options object
      const baseUrl = 'http://localhost:3000'
      const fullUrl = methodOrOptions.url?.startsWith('http') ? methodOrOptions.url : `${baseUrl}${methodOrOptions.url || '/api/test'}`
      options = {
        method: methodOrOptions.method || 'GET',
        url: fullUrl,
        headers: methodOrOptions.headers || {},
        body: methodOrOptions.body,
        cookies: methodOrOptions.cookies || {}
      }
    }
    const request = new NextRequest(options.url, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    // Mock cookies
    Object.entries(options.cookies).forEach(([name, value]) => {
      request.cookies.set(name, value)
    })

    return request
  }

  /**
   * Create a test user (mock data for testing)
   */
  static async createTestUser({
    email = 'test@example.com',
    username = 'testuser',
    password = 'TestPassword123!',
    role = 'user',
    emailVerified = true
  }: {
    email?: string
    username?: string
    password?: string
    role?: string
    emailVerified?: boolean
  } = {}) {
    // Return mock user data for testing
    return {
      id: 'test-user-id-' + Math.random().toString(36).substr(2, 9),
      email,
      username,
      password: 'hashed-password',
      role,
      emailVerified,
      firstName: 'Test',
      lastName: 'User',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Generate a valid JWT token for testing
   */
  static async generateTestToken(userId: string, role: string = 'user', email: string = 'test@example.com', username: string = 'testuser') {
    const result = await jwtService.generateAccessToken({
      sub: userId,
      email,
      username,
      role
    })
    return result.token
  }

  /**
   * Clean up test data from database
   */
  static async cleanupTestData() {
    await prisma.refreshToken.deleteMany()
    await prisma.session.deleteMany()
    await prisma.loginAttempt.deleteMany()
    await prisma.webauthnCredential.deleteMany()
    await prisma.user.deleteMany()
  }

  /**
   * Wait for a specified amount of time (useful for rate limiting tests)
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Assert response structure and status
   */
  static async assertResponse(
    response: Response,
    expectedStatus: number,
    expectedStructure?: Record<string, any>
  ) {
    expect(response.status).toBe(expectedStatus)
    
    if (expectedStructure) {
      const data = await response.json()
      Object.keys(expectedStructure).forEach(key => {
        expect(data).toHaveProperty(key)
      })
    }
  }

  /**
   * Assert API response with comprehensive validation
   */
  static async assertApiResponse(
    response: Response,
    {
      expectedStatus,
      expectedSuccess,
      expectedErrorCode,
      expectedData
    }: {
      expectedStatus: number
      expectedSuccess: boolean
      expectedErrorCode?: string
      expectedData?: any
    }
  ) {
    expect(response.status).toBe(expectedStatus)
    
    const data = await response.json()
    expect(data.success).toBe(expectedSuccess)
    
    if (expectedErrorCode) {
      expect(data.error?.code).toBe(expectedErrorCode)
    }
    
    if (expectedData) {
      Object.keys(expectedData).forEach(key => {
        expect(data.data).toHaveProperty(key, expectedData[key])
      })
    }
  }

  /**
   * Create mock environment for testing
   */
  static setupTestEnvironment() {
    process.env.NODE_ENV = 'test'
    process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing'
    process.env.JWT_SECRET = 'test-jwt-secret-key'
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb'
  }

  /**
   * Performance testing helper
   */
  static async measurePerformance<T>(
    operation: () => Promise<T>,
    maxDurationMs: number = 1000
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now()
    const result = await operation()
    const duration = Date.now() - startTime
    
    expect(duration).toBeLessThan(maxDurationMs)
    
    return { result, duration }
  }
}

/**
 * Database test utilities
 */
export class DatabaseTestUtils {
  /**
   * Setup test database state
   */
  static async setupTestDatabase() {
    // Ensure clean state
    await TestHelpers.cleanupTestData()
  }

  /**
   * Teardown test database state
   */
  static async teardownTestDatabase() {
    await TestHelpers.cleanupTestData()
    await prisma.$disconnect()
  }
}

/**
 * Mock data generators
 */
export class MockDataGenerator {
  static generateUserData(overrides: Partial<any> = {}) {
    return {
      email: 'test@example.com',
      username: 'testuser',
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      ...overrides
    }
  }

  static generateAdminData(overrides: Partial<any> = {}) {
    return {
      email: 'admin@example.com',
      username: 'adminuser',
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      ...overrides
    }
  }
}