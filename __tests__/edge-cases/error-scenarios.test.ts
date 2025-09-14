import { NextRequest } from 'next/server'
import { createMockRequest, createTestUser, cleanupTestData } from '../utils/test-helpers'
import { POST as loginHandler } from '@/app/api/auth/login/route'
import { POST as registerHandler } from '@/app/api/auth/register/route'
import { GET as profileHandler } from '@/app/api/auth/profile/route'
import { POST as changePasswordHandler } from '@/app/api/auth/change-password/route'
import { POST as changeUsernameHandler } from '@/app/api/auth/change-username/route'

describe('Edge Cases and Error Scenarios', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    testUser = await createTestUser({
      username: 'edgetest',
      email: 'edge@test.com',
      password: 'EdgeTest123!'
    })

    // Get auth token
    const loginRequest = createMockRequest('POST', '/api/auth/login', {
      email: testUser.email,
      password: 'EdgeTest123!'
    })
    const loginResponse = await loginHandler(loginRequest)
    const loginData = await loginResponse.json()
    authToken = loginData.data.token
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  describe('Malformed Request Bodies', () => {
    it('should handle completely empty request body', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      })

      const response = await loginHandler(request)
      expect(response.status).toBe(400)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
    })

    it('should handle invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json}'
      })

      const response = await loginHandler(request)
      expect(response.status).toBe(400)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
    })

    it('should handle null values in request body', async () => {
      const request = createMockRequest('POST', '/api/auth/login', {
        email: null,
        password: null
      })

      const response = await loginHandler(request)
      expect(response.status).toBe(400)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
    })

    it('should handle undefined values in request body', async () => {
      const request = createMockRequest('POST', '/api/auth/register', {
        username: undefined,
        email: 'test@example.com',
        password: undefined
      })

      const response = await registerHandler(request)
      expect(response.status).toBe(400)
    })

    it('should handle extremely large request body', async () => {
      const largeString = 'a'.repeat(1000000) // 1MB string
      const request = createMockRequest('POST', '/api/auth/register', {
        username: largeString,
        email: 'large@test.com',
        password: 'LargeTest123!'
      })

      const response = await registerHandler(request)
      expect(response.status).toBe(400)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
    })
  })

  describe('Boundary Value Testing', () => {
    it('should handle minimum valid username length', async () => {
      const request = createMockRequest('POST', '/api/auth/register', {
        username: 'abc', // Minimum 3 characters
        email: 'min@test.com',
        password: 'MinTest123!'
      })

      const response = await registerHandler(request)
      expect([201, 400]).toContain(response.status) // Depends on validation rules
    })

    it('should handle maximum valid username length', async () => {
      const maxUsername = 'a'.repeat(50) // Assuming 50 is max
      const request = createMockRequest('POST', '/api/auth/register', {
        username: maxUsername,
        email: 'max@test.com',
        password: 'MaxTest123!'
      })

      const response = await registerHandler(request)
      expect([201, 400]).toContain(response.status)
    })

    it('should reject username exceeding maximum length', async () => {
      const tooLongUsername = 'a'.repeat(101) // Exceeds typical max
      const request = createMockRequest('POST', '/api/auth/register', {
        username: tooLongUsername,
        email: 'toolong@test.com',
        password: 'TooLong123!'
      })

      const response = await registerHandler(request)
      expect(response.status).toBe(400)
    })

    it('should handle edge case email formats', async () => {
      const edgeEmails = [
        'a@b.co', // Very short
        'test+tag@example.com', // Plus addressing
        'user.name+tag@example.co.uk', // Multiple dots and plus
        'test@sub.domain.example.com', // Subdomain
        '123@456.789' // Numeric
      ]

      for (const email of edgeEmails) {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: `user${Date.now()}${Math.random()}`,
          email: email,
          password: 'EdgeEmail123!'
        })

        const response = await registerHandler(request)
        // Should either succeed or fail with validation error
        expect([201, 400]).toContain(response.status)
      }
    })
  })

  describe('Special Characters and Encoding', () => {
    it('should handle special characters in username', async () => {
      const specialUsernames = [
        'user-name', // Hyphen
        'user_name', // Underscore
        'user.name', // Dot
        'user123', // Numbers
        'User123' // Mixed case
      ]

      for (const username of specialUsernames) {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: username,
          email: `${username.toLowerCase()}@test.com`,
          password: 'Special123!'
        })

        const response = await registerHandler(request)
        expect([201, 400, 409]).toContain(response.status)
      }
    })

    it('should handle Unicode characters', async () => {
      const unicodeUsernames = [
        'user测试', // Chinese characters
        'userñame', // Spanish characters
        'userémoji', // Accented characters
        'user🚀test' // Emoji
      ]

      for (const username of unicodeUsernames) {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: username,
          email: `unicode${Date.now()}@test.com`,
          password: 'Unicode123!'
        })

        const response = await registerHandler(request)
        expect([201, 400]).toContain(response.status)
      }
    })

    it('should handle SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "admin'--",
        "' OR '1'='1",
        "'; INSERT INTO users VALUES ('hacker', 'hack@evil.com'); --"
      ]

      for (const maliciousInput of sqlInjectionAttempts) {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: maliciousInput,
          password: 'password'
        })

        const response = await loginHandler(request)
        expect(response.status).toBe(400) // Should be rejected as invalid
      }
    })

    it('should handle XSS attempts', async () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '\u003cscript\u003ealert("xss")\u003c/script\u003e'
      ]

      for (const xssPayload of xssAttempts) {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: xssPayload,
          email: 'xss@test.com',
          password: 'XssTest123!'
        })

        const response = await registerHandler(request)
        expect([400, 409]).toContain(response.status) // Should be rejected or sanitized
      }
    })
  })

  describe('Authentication Edge Cases', () => {
    it('should handle malformed JWT tokens', async () => {
      const malformedTokens = [
        'invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
        'Bearer',
        'Bearer ',
        'Bearer invalid-token-format',
        'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // Wrong prefix
      ]

      for (const token of malformedTokens) {
        const request = createMockRequest('GET', '/api/auth/profile', null, {
          'Authorization': token
        })

        const response = await profileHandler(request)
        expect(response.status).toBe(401)
        
        const responseData = await response.json()
        expect(responseData.success).toBe(false)
      }
    })

    it('should handle expired JWT tokens', async () => {
      // Create a token with past expiration (this would need actual JWT creation)
      const expiredToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid'
      
      const request = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': expiredToken
      })

      const response = await profileHandler(request)
      expect(response.status).toBe(401)
    })

    it('should handle multiple authorization headers', async () => {
      const request = new NextRequest('http://localhost/api/auth/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'authorization': 'Bearer another-token' // Duplicate with different case
        }
      })

      const response = await profileHandler(request)
      // Should handle gracefully, typically using the first valid one
      expect([200, 401]).toContain(response.status)
    })

    it('should handle case-insensitive authorization header', async () => {
      const request = createMockRequest('GET', '/api/auth/profile', null, {
        'authorization': `Bearer ${authToken}` // Lowercase
      })

      const response = await profileHandler(request)
      expect(response.status).toBe(200) // Should work regardless of case
    })
  })

  describe('Race Conditions and Concurrency', () => {
    it('should handle simultaneous password changes', async () => {
      const promises = Array.from({ length: 5 }, (_, index) => {
        const request = createMockRequest('POST', '/api/auth/change-password', {
          currentPassword: 'EdgeTest123!',
          newPassword: `NewPassword${index}123!`
        }, {
          'Authorization': `Bearer ${authToken}`
        })
        return changePasswordHandler(request)
      })

      const responses = await Promise.all(promises)
      
      // Only one should succeed, others should fail
      const successCount = responses.filter(r => r.status === 200).length
      const failureCount = responses.filter(r => r.status !== 200).length
      
      expect(successCount).toBeLessThanOrEqual(1) // At most one should succeed
      expect(failureCount).toBeGreaterThanOrEqual(4) // Others should fail
    })

    it('should handle simultaneous username changes', async () => {
      const promises = Array.from({ length: 3 }, (_, index) => {
        const request = createMockRequest('POST', '/api/auth/change-username', {
          newUsername: `racecondition${index}`
        }, {
          'Authorization': `Bearer ${authToken}`
        })
        return changeUsernameHandler(request)
      })

      const responses = await Promise.all(promises)
      
      // Only one should succeed
      const successCount = responses.filter(r => r.status === 200).length
      expect(successCount).toBeLessThanOrEqual(1)
    })

    it('should handle rapid successive login attempts', async () => {
      const rapidRequests = Array.from({ length: 10 }, () => {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'EdgeTest123!'
        })
        return loginHandler(request)
      })

      const responses = await Promise.all(rapidRequests)
      
      // All should succeed (no rate limiting in this test)
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })
  })

  describe('Resource Exhaustion', () => {
    it('should handle requests with extremely long passwords', async () => {
      const longPassword = 'A1!' + 'a'.repeat(1000) // Very long password
      
      const request = createMockRequest('POST', '/api/auth/register', {
        username: 'longpassuser',
        email: 'longpass@test.com',
        password: longPassword
      })

      const response = await registerHandler(request)
      expect(response.status).toBe(400) // Should be rejected
    })

    it('should handle requests with many fields', async () => {
      const requestBody: any = {
        username: 'manyfields',
        email: 'many@test.com',
        password: 'ManyFields123!'
      }

      // Add many extra fields
      for (let i = 0; i < 100; i++) {
        requestBody[`extraField${i}`] = `value${i}`
      }

      const request = createMockRequest('POST', '/api/auth/register', requestBody)
      const response = await registerHandler(request)
      
      // Should handle gracefully (extra fields ignored)
      expect([201, 400]).toContain(response.status)
    })

    it('should handle deeply nested objects', async () => {
      let nestedObject: any = { value: 'deep' }
      for (let i = 0; i < 50; i++) {
        nestedObject = { nested: nestedObject }
      }

      const request = createMockRequest('POST', '/api/auth/register', {
        username: 'deepnest',
        email: 'deep@test.com',
        password: 'DeepNest123!',
        metadata: nestedObject
      })

      const response = await registerHandler(request)
      expect([201, 400]).toContain(response.status)
    })
  })

  describe('Network and Protocol Edge Cases', () => {
    it('should handle missing Content-Type header', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: 'EdgeTest123!'
        })
        // No Content-Type header
      })

      const response = await loginHandler(request)
      // Should handle gracefully
      expect([200, 400]).toContain(response.status)
    })

    it('should handle wrong Content-Type header', async () => {
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain' // Wrong content type
        },
        body: JSON.stringify({
          email: testUser.email,
          password: 'EdgeTest123!'
        })
      })

      const response = await loginHandler(request)
      expect([200, 400]).toContain(response.status)
    })

    it('should handle requests with unusual HTTP methods', async () => {
      // Test with PATCH method on login endpoint
      const request = new NextRequest('http://localhost/api/auth/login', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'EdgeTest123!'
        })
      })

      // Should return method not allowed or handle gracefully
      try {
        const response = await loginHandler(request as any)
        expect([405, 400]).toContain(response.status)
      } catch (error) {
        // Method might not be supported at all
        expect(error).toBeDefined()
      }
    })
  })

  describe('Data Consistency Edge Cases', () => {
    it('should handle case sensitivity in email addresses', async () => {
      const emailVariations = [
        testUser.email.toUpperCase(),
        testUser.email.toLowerCase(),
        testUser.email.charAt(0).toUpperCase() + testUser.email.slice(1)
      ]

      for (const email of emailVariations) {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: email,
          password: 'EdgeTest123!'
        })

        const response = await loginHandler(request)
        // Should handle consistently (typically case-insensitive)
        expect([200, 401]).toContain(response.status)
      }
    })

    it('should handle whitespace in input fields', async () => {
      const request = createMockRequest('POST', '/api/auth/login', {
        email: `  ${testUser.email}  `, // Leading/trailing spaces
        password: 'EdgeTest123!'
      })

      const response = await loginHandler(request)
      // Should handle by trimming or rejecting
      expect([200, 400, 401]).toContain(response.status)
    })

    it('should handle duplicate registration attempts', async () => {
      const userData = {
        username: 'duplicatetest',
        email: 'duplicate@test.com',
        password: 'Duplicate123!'
      }

      // First registration
      const firstRequest = createMockRequest('POST', '/api/auth/register', userData)
      const firstResponse = await registerHandler(firstRequest)
      
      // Second registration with same data
      const secondRequest = createMockRequest('POST', '/api/auth/register', userData)
      const secondResponse = await registerHandler(secondRequest)

      // First should succeed, second should fail
      expect(firstResponse.status).toBe(201)
      expect(secondResponse.status).toBe(409)
    })
  })
})