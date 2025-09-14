import { NextRequest } from 'next/server'
import { TestHelpers } from '../utils/test-helpers'
import { POST as loginHandler } from '@/app/api/auth/secure-login/route'
import { POST as registerHandler } from '@/app/api/auth/secure-register/route'
import { GET as profileHandler } from '@/app/api/auth/profile/route'
import { POST as logoutHandler } from '@/app/api/auth/secure-logout/route'
import { POST as changeUsernameHandler } from '@/app/api/auth/change-username/route'

describe('Authentication Endpoints Integration Tests', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    // Create test user for integration tests
    testUser = await TestHelpers.createTestUser({
      username: 'integrationtest',
      email: 'integration@test.com',
      password: 'TestPassword123!'
    })
  })

  afterAll(async () => {
    await TestHelpers.cleanupTestData()
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const requestData = {
        username: 'newuser123',
        email: 'newuser@test.com',
        password: 'SecurePass123!'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/register', requestData)
      const response = await registerHandler(request)

      await TestHelpers.assertApiResponse(response, {
        expectedStatus: 201,
        expectedSuccess: true,
        requiredFields: ['user', 'token']
      })

      const responseData = await response.json()
      expect(responseData.data.user.username).toBe(requestData.username)
      expect(responseData.data.user.email).toBe(requestData.email)
      expect(responseData.data.user.password).toBeUndefined()
      expect(responseData.data.token).toBeDefined()
    })

    it('should reject registration with existing email', async () => {
      const requestData = {
        username: 'anotheruser',
        email: testUser.email, // Use existing email
        password: 'SecurePass123!'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/register', requestData)
      const response = await registerHandler(request)

      await TestHelpers.assertApiResponse(response, {
        expectedStatus: 409,
        expectedSuccess: false,
        expectedErrorCode: 'CONFLICT'
      })
    })

    it('should reject registration with invalid data', async () => {
      const requestData = {
        username: 'ab', // Too short
        email: 'invalid-email',
        password: '123' // Too weak
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/register', requestData)
      const response = await registerHandler(request)

      await TestHelpers.assertApiResponse(response, {
        expectedStatus: 400,
        expectedSuccess: false,
        expectedErrorCode: 'VALIDATION_ERROR'
      })
    })

    it('should reject registration with missing fields', async () => {
      const requestData = {
        username: 'testuser'
        // Missing email and password
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/register', requestData)
      const response = await registerHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 400,
        expectedSuccess: false
      })
    })
  })

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const requestData = {
        email: testUser.email,
        password: 'TestPassword123!'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/login', requestData)
      const response = await loginHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 200,
        expectedSuccess: true,
        requiredFields: ['user', 'token']
      })

      const responseData = await response.json()
      authToken = responseData.data.token
      expect(responseData.data.user.email).toBe(testUser.email)
      expect(responseData.data.user.password).toBeUndefined()
    })

    it('should reject login with invalid email', async () => {
      const requestData = {
        email: 'nonexistent@test.com',
        password: 'TestPassword123!'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/login', requestData)
      const response = await loginHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false,
        expectedErrorCode: 'UNAUTHORIZED'
      })
    })

    it('should reject login with invalid password', async () => {
      const requestData = {
        email: testUser.email,
        password: 'WrongPassword123!'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/login', requestData)
      const response = await loginHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false,
        expectedErrorCode: 'UNAUTHORIZED'
      })
    })

    it('should reject login with malformed request', async () => {
      const requestData = {
        email: 'invalid-email-format',
        password: ''
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/login', requestData)
      const response = await loginHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 400,
        expectedSuccess: false
      })
    })
  })

  describe('GET /api/auth/profile', () => {
    it('should get user profile with valid token', async () => {
      const request = TestHelpers.createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${authToken}`
      })
      const response = await profileHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 200,
        expectedSuccess: true,
        requiredFields: ['user']
      })

      const responseData = await response.json()
      expect(responseData.data.user.email).toBe(testUser.email)
      expect(responseData.data.user.password).toBeUndefined()
    })

    it('should reject request without token', async () => {
      const request = TestHelpers.createMockRequest('GET', '/api/auth/profile')
      const response = await profileHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false,
        expectedErrorCode: 'UNAUTHORIZED'
      })
    })

    it('should reject request with invalid token', async () => {
      const request = TestHelpers.createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': 'Bearer invalid-token'
      })
      const response = await profileHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false,
        expectedErrorCode: 'UNAUTHORIZED'
      })
    })

    it('should reject request with malformed authorization header', async () => {
      const request = TestHelpers.createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': 'InvalidFormat token'
      })
      const response = await profileHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false
      })
    })
  })

  describe('POST /api/auth/change-username', () => {
    it('should change username with valid data', async () => {
      const requestData = {
        newUsername: 'updatedusername123'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/change-username', requestData, {
        'Authorization': `Bearer ${authToken}`
      })
      const response = await changeUsernameHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 200,
        expectedSuccess: true,
        requiredFields: ['user']
      })

      const responseData = await response.json()
      expect(responseData.data.user.username).toBe(requestData.newUsername)
    })

    it('should reject username change to existing username', async () => {
      // First create another user
      const anotherUser = await createTestUser({
        username: 'existinguser',
        email: 'existing@test.com',
        password: 'TestPassword123!'
      })

      const requestData = {
        newUsername: anotherUser.username
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/change-username', requestData, {
        'Authorization': `Bearer ${authToken}`
      })
      const response = await changeUsernameHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 409,
        expectedSuccess: false,
        expectedErrorCode: 'CONFLICT'
      })
    })

    it('should reject username change with invalid username', async () => {
      const requestData = {
        newUsername: 'ab' // Too short
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/change-username', requestData, {
        'Authorization': `Bearer ${authToken}`
      })
      const response = await changeUsernameHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 400,
        expectedSuccess: false,
        expectedErrorCode: 'VALIDATION_ERROR'
      })
    })

    it('should reject username change without authentication', async () => {
      const requestData = {
        newUsername: 'newusername123'
      }

      const request = TestHelpers.createMockRequest('POST', '/api/auth/change-username', requestData)
      const response = await changeUsernameHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 401,
        expectedSuccess: false,
        expectedErrorCode: 'UNAUTHORIZED'
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const request = TestHelpers.createMockRequest('POST', '/api/auth/logout', null, {
        'Authorization': `Bearer ${authToken}`
      })
      const response = await logoutHandler(request)

      await assertApiResponse(response, {
        expectedStatus: 200,
        expectedSuccess: true
      })
    })

    it('should handle logout without token gracefully', async () => {
      const request = TestHelpers.createMockRequest('POST', '/api/auth/logout')
      const response = await logoutHandler(request)

      // Logout might still succeed even without token (implementation dependent)
      expect([200, 401]).toContain(response.status)
    })

    it('should handle logout with invalid token', async () => {
      const request = TestHelpers.createMockRequest('POST', '/api/auth/logout', null, {
        'Authorization': 'Bearer invalid-token'
      })
      const response = await logoutHandler(request)

      // Should handle gracefully
      expect([200, 401]).toContain(response.status)
    })
  })

  describe('Cross-Endpoint Integration', () => {
    it('should maintain session consistency across endpoints', async () => {
      // Register new user
      const registerData = {
        username: 'sessiontest',
        email: 'session@test.com',
        password: 'SessionTest123!'
      }

      const registerRequest = TestHelpers.createMockRequest('POST', '/api/auth/register', registerData)
      const registerResponse = await registerHandler(registerRequest)
      const registerResult = await registerResponse.json()
      const sessionToken = registerResult.data.token

      // Use token to access profile
      const profileRequest = TestHelpers.createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${sessionToken}`
      })
      const profileResponse = await profileHandler(profileRequest)
      const profileResult = await profileResponse.json()

      expect(profileResult.data.user.username).toBe(registerData.username)
      expect(profileResult.data.user.email).toBe(registerData.email)

      // Change username
      const changeUsernameRequest = TestHelpers.createMockRequest('POST', '/api/auth/change-username', 
        { newUsername: 'sessiontestupdated' }, 
        { 'Authorization': `Bearer ${sessionToken}` }
      )
      const changeUsernameResponse = await changeUsernameHandler(changeUsernameRequest)
      const changeUsernameResult = await changeUsernameResponse.json()

      expect(changeUsernameResult.data.user.username).toBe('sessiontestupdated')

      // Verify profile reflects the change
      const updatedProfileRequest = TestHelpers.createMockRequest('GET', '/api/auth/profile', null, {
        'Authorization': `Bearer ${sessionToken}`
      })
      const updatedProfileResponse = await profileHandler(updatedProfileRequest)
      const updatedProfileResult = await updatedProfileResponse.json()

      expect(updatedProfileResult.data.user.username).toBe('sessiontestupdated')
    })
  })

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent login requests', async () => {
      const loginPromises = Array.from({ length: 10 }, () => {
        const request = TestHelpers.createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'NewSecurePass456!' // Updated password from previous test
        })
        return loginHandler(request)
      })

      const responses = await Promise.all(loginPromises)
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })

    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now()
      
      const request = TestHelpers.createMockRequest('POST', '/api/auth/login', {
        email: testUser.email,
        password: 'NewSecurePass456!'
      })
      const response = await loginHandler(request)
      
      const endTime = Date.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      expect(responseTime).toBeLessThan(5000) // Should respond within 5 seconds
    })
  })
})