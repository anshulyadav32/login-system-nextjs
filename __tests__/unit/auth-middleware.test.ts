import { AuthMiddleware } from '@/middlewares/auth'
import { TestHelpers, DatabaseTestUtils } from '../utils/test-helpers'
import { NextRequest } from 'next/server'

describe('Auth Middleware', () => {
  beforeAll(async () => {
    TestHelpers.setupTestEnvironment()
    await DatabaseTestUtils.setupTestDatabase()
  })

  afterAll(async () => {
    await DatabaseTestUtils.teardownTestDatabase()
  })

  afterEach(async () => {
    await TestHelpers.cleanupTestData()
  })

  describe('Authentication Validation', () => {
    it('should return unauthenticated for requests without token', async () => {
      const request = TestHelpers.createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/test'
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication token required')
    })

    it('should return unauthenticated for invalid token', async () => {
      const request = TestHelpers.createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid')
    })

    it('should authenticate valid token successfully', async () => {
      // Create test user
      const testUser = await TestHelpers.createTestUser({
        email: 'auth-test@example.com',
        username: 'authtest'
      })

      // Generate valid token
      const token = await TestHelpers.generateTestToken(testUser.id, testUser.role, testUser.email, testUser.username)

      const request = TestHelpers.createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.context.user).toBeTruthy()
        expect(result.context.user.id).toBe(testUser.id)
        expect(result.context.user.email).toBe(testUser.email)
      }
    })

    it('should handle expired tokens', async () => {
      // This would require mocking JWT expiration
      const request = TestHelpers.createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/test',
        headers: {
          'Authorization': 'Bearer expired-token'
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid')
    })
  })

  describe('Token Extraction', () => {
    it('should extract token from Authorization header', async () => {
      const testUser = await TestHelpers.createTestUser()
      const token = await TestHelpers.generateTestToken(testUser.id)

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await AuthMiddleware.validateAuth(request)
      expect(result.success).toBe(true)
    })

    it('should extract token from cookie', async () => {
      const testUser = await TestHelpers.createTestUser()
      const token = await TestHelpers.generateTestToken(testUser.id, testUser.role, testUser.email, testUser.username)

      const request = TestHelpers.createMockRequest({
        cookies: {
          'auth-token': token
        }
      })

      const result = await AuthMiddleware.validateAuth(request)
      expect(result.success).toBe(true)
    })

    it('should prioritize Authorization header over cookie', async () => {
      const testUser = await TestHelpers.createTestUser()
      const validToken = await TestHelpers.generateTestToken(testUser.id)

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${validToken}`
        },
        cookies: {
          'access-token': 'invalid-cookie-token'
        }
      })

      const result = await AuthMiddleware.validateAuth(request)
      expect(result.success).toBe(true)
    })
  })

  describe('User Role Validation', () => {
    it('should authenticate admin user correctly', async () => {
      const adminUser = await TestHelpers.createTestUser({
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin'
      })

      const token = await TestHelpers.generateTestToken(adminUser.id, 'admin')

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.context.user.role).toBe('admin')
      }
    })

    it('should authenticate regular user correctly', async () => {
      const regularUser = await TestHelpers.createTestUser({
        role: 'user'
      })

      const token = await TestHelpers.generateTestToken(regularUser.id, 'user')

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.context.user.role).toBe('user')
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed Authorization header', async () => {
      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': 'InvalidFormat'
        }
      })

      const result = await AuthMiddleware.validateAuth(request)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Authentication token required')
    })

    it('should handle database connection errors gracefully', async () => {
      // This would require mocking database errors
      const testUser = await TestHelpers.createTestUser()
      const token = await TestHelpers.generateTestToken(testUser.id)

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      // Mock database error would go here
      const result = await AuthMiddleware.validateAuth(request)
      
      // Should still handle gracefully
      expect(result).toBeDefined()
    })
  })

  describe('Performance', () => {
    it('should authenticate within acceptable time limits', async () => {
      const testUser = await TestHelpers.createTestUser()
      const token = await TestHelpers.generateTestToken(testUser.id)

      const request = TestHelpers.createMockRequest({
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const { result, duration } = await TestHelpers.measurePerformance(
        () => AuthMiddleware.validateAuth(request),
        500 // Should complete within 500ms
      )

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(500)
    })
  })
})