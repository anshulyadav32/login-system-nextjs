import { NextRequest } from 'next/server'
import { createMockRequest, createTestUser, cleanupTestData, measurePerformance } from '../utils/test-helpers'
import { POST as loginHandler } from '@/app/api/auth/login/route'
import { POST as registerHandler } from '@/app/api/auth/register/route'
import { GET as profileHandler } from '@/app/api/auth/profile/route'

describe('Performance Benchmark Tests', () => {
  let testUser: any
  let authToken: string

  beforeAll(async () => {
    testUser = await createTestUser({
      username: 'perftest',
      email: 'perf@test.com',
      password: 'PerfTest123!'
    })

    // Get auth token for authenticated endpoints
    const loginRequest = createMockRequest('POST', '/api/auth/login', {
      email: testUser.email,
      password: 'PerfTest123!'
    })
    const loginResponse = await loginHandler(loginRequest)
    const loginData = await loginResponse.json()
    authToken = loginData.data.token
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  describe('Single Request Performance', () => {
    it('should handle login requests within performance threshold', async () => {
      const { duration, result } = await measurePerformance(async () => {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'PerfTest123!'
        })
        return await loginHandler(request)
      })

      expect(result.status).toBe(200)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
      
      console.log(`Login request completed in ${duration}ms`)
    })

    it('should handle profile requests within performance threshold', async () => {
      const { duration, result } = await measurePerformance(async () => {
        const request = createMockRequest('GET', '/api/auth/profile', null, {
          'Authorization': `Bearer ${authToken}`
        })
        return await profileHandler(request)
      })

      expect(result.status).toBe(200)
      expect(duration).toBeLessThan(500) // Should complete within 500ms
      
      console.log(`Profile request completed in ${duration}ms`)
    })

    it('should handle registration requests within performance threshold', async () => {
      const { duration, result } = await measurePerformance(async () => {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: `perfuser${Date.now()}`,
          email: `perfuser${Date.now()}@test.com`,
          password: 'PerfTest123!'
        })
        return await registerHandler(request)
      })

      expect(result.status).toBe(201)
      expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
      
      console.log(`Registration request completed in ${duration}ms`)
    })
  })

  describe('Concurrent Request Performance', () => {
    it('should handle concurrent login requests efficiently', async () => {
      const concurrentRequests = 20
      const startTime = Date.now()

      const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: testUser.email,
          password: 'PerfTest123!'
        })
        
        const { duration, result } = await measurePerformance(() => loginHandler(request))
        return { duration, result, index }
      })

      const results = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // All requests should succeed
      results.forEach(({ result, index }) => {
        expect(result.status).toBe(200)
      })

      // Calculate performance metrics
      const durations = results.map(r => r.duration)
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const minDuration = Math.min(...durations)
      const throughput = (concurrentRequests / totalTime) * 1000 // requests per second

      console.log(`Concurrent Login Performance:`);
      console.log(`  Total requests: ${concurrentRequests}`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Min duration: ${minDuration}ms`);
      console.log(`  Max duration: ${maxDuration}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} req/sec`);

      // Performance assertions
      expect(avgDuration).toBeLessThan(2000) // Average should be under 2 seconds
      expect(maxDuration).toBeLessThan(5000) // No request should take more than 5 seconds
      expect(throughput).toBeGreaterThan(1) // Should handle at least 1 request per second
    })

    it('should handle concurrent profile requests efficiently', async () => {
      const concurrentRequests = 50
      const startTime = Date.now()

      const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
        const request = createMockRequest('GET', '/api/auth/profile', null, {
          'Authorization': `Bearer ${authToken}`
        })
        
        const { duration, result } = await measurePerformance(() => profileHandler(request))
        return { duration, result, index }
      })

      const results = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // All requests should succeed
      results.forEach(({ result }) => {
        expect(result.status).toBe(200)
      })

      // Calculate performance metrics
      const durations = results.map(r => r.duration)
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const throughput = (concurrentRequests / totalTime) * 1000

      console.log(`Concurrent Profile Performance:`);
      console.log(`  Total requests: ${concurrentRequests}`);
      console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Max duration: ${maxDuration}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} req/sec`);

      // Profile requests should be faster than login
      expect(avgDuration).toBeLessThan(1000)
      expect(maxDuration).toBeLessThan(3000)
      expect(throughput).toBeGreaterThan(5) // Should handle at least 5 requests per second
    })

    it('should handle mixed concurrent requests efficiently', async () => {
      const totalRequests = 30
      const startTime = Date.now()

      const promises = Array.from({ length: totalRequests }, async (_, index) => {
        let request: NextRequest
        let handler: Function
        let type: string

        // Mix different types of requests
        if (index % 3 === 0) {
          // Login request
          request = createMockRequest('POST', '/api/auth/login', {
            email: testUser.email,
            password: 'PerfTest123!'
          })
          handler = loginHandler
          type = 'login'
        } else if (index % 3 === 1) {
          // Profile request
          request = createMockRequest('GET', '/api/auth/profile', null, {
            'Authorization': `Bearer ${authToken}`
          })
          handler = profileHandler
          type = 'profile'
        } else {
          // Registration request
          request = createMockRequest('POST', '/api/auth/register', {
            username: `mixeduser${index}${Date.now()}`,
            email: `mixeduser${index}${Date.now()}@test.com`,
            password: 'MixedTest123!'
          })
          handler = registerHandler
          type = 'register'
        }
        
        const { duration, result } = await measurePerformance(() => handler(request))
        return { duration, result, type, index }
      })

      const results = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // Group results by type
      const loginResults = results.filter(r => r.type === 'login')
      const profileResults = results.filter(r => r.type === 'profile')
      const registerResults = results.filter(r => r.type === 'register')

      // All requests should succeed
      loginResults.forEach(({ result }) => expect(result.status).toBe(200))
      profileResults.forEach(({ result }) => expect(result.status).toBe(200))
      registerResults.forEach(({ result }) => expect(result.status).toBe(201))

      // Calculate overall metrics
      const allDurations = results.map(r => r.duration)
      const avgDuration = allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length
      const throughput = (totalRequests / totalTime) * 1000

      console.log(`Mixed Concurrent Requests Performance:`);
      console.log(`  Total requests: ${totalRequests}`);
      console.log(`  Login requests: ${loginResults.length}`);
      console.log(`  Profile requests: ${profileResults.length}`);
      console.log(`  Register requests: ${registerResults.length}`);
      console.log(`  Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgDuration).toBeLessThan(2000)
      expect(throughput).toBeGreaterThan(2)
    })
  })

  describe('Memory and Resource Usage', () => {
    it('should not cause memory leaks during sustained load', async () => {
      const iterations = 100
      const batchSize = 10
      
      // Record initial memory usage if available
      const initialMemory = process.memoryUsage ? process.memoryUsage() : null

      for (let i = 0; i < iterations; i += batchSize) {
        const batch = Array.from({ length: Math.min(batchSize, iterations - i) }, async () => {
          const request = createMockRequest('GET', '/api/auth/profile', null, {
            'Authorization': `Bearer ${authToken}`
          })
          const response = await profileHandler(request)
          expect(response.status).toBe(200)
          return response
        })

        await Promise.all(batch)
        
        // Allow garbage collection between batches
        if (global.gc) {
          global.gc()
        }
      }

      // Check memory usage after load test
      const finalMemory = process.memoryUsage ? process.memoryUsage() : null
      
      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed
        const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100
        
        console.log(`Memory Usage:`);
        console.log(`  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${memoryIncreasePercent.toFixed(2)}%)`);
        
        // Memory increase should be reasonable (less than 100% increase)
        expect(memoryIncreasePercent).toBeLessThan(100)
      }
    })
  })

  describe('Error Handling Performance', () => {
    it('should handle authentication errors efficiently', async () => {
      const concurrentRequests = 20
      const startTime = Date.now()

      const promises = Array.from({ length: concurrentRequests }, async () => {
        const request = createMockRequest('POST', '/api/auth/login', {
          email: 'nonexistent@test.com',
          password: 'WrongPassword123!'
        })
        
        const { duration, result } = await measurePerformance(() => loginHandler(request))
        return { duration, result }
      })

      const results = await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // All requests should fail with 401
      results.forEach(({ result }) => {
        expect(result.status).toBe(401)
      })

      // Error handling should be fast
      const durations = results.map(r => r.duration)
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const throughput = (concurrentRequests / totalTime) * 1000

      console.log(`Error Handling Performance:`);
      console.log(`  Average error response time: ${avgDuration.toFixed(2)}ms`);
      console.log(`  Error throughput: ${throughput.toFixed(2)} req/sec`);

      expect(avgDuration).toBeLessThan(500) // Errors should be handled quickly
      expect(throughput).toBeGreaterThan(10) // Should handle errors efficiently
    })

    it('should handle validation errors efficiently', async () => {
      const concurrentRequests = 15
      
      const promises = Array.from({ length: concurrentRequests }, async () => {
        const request = createMockRequest('POST', '/api/auth/register', {
          username: 'ab', // Too short
          email: 'invalid-email',
          password: '123' // Too weak
        })
        
        const { duration, result } = await measurePerformance(() => registerHandler(request))
        return { duration, result }
      })

      const results = await Promise.all(promises)

      // All requests should fail with validation error
      results.forEach(({ result }) => {
        expect(result.status).toBe(400)
      })

      // Validation should be fast
      const durations = results.map(r => r.duration)
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length

      console.log(`Validation Error Performance: ${avgDuration.toFixed(2)}ms average`);
      
      expect(avgDuration).toBeLessThan(200) // Validation should be very fast
    })
  })

  describe('Scalability Tests', () => {
    it('should maintain performance under increasing load', async () => {
      const loadLevels = [5, 10, 20, 30]
      const results: Array<{ load: number; avgDuration: number; throughput: number }> = []

      for (const load of loadLevels) {
        const startTime = Date.now()
        
        const promises = Array.from({ length: load }, async () => {
          const request = createMockRequest('GET', '/api/auth/profile', null, {
            'Authorization': `Bearer ${authToken}`
          })
          
          const { duration, result } = await measurePerformance(() => profileHandler(request))
          return { duration, result }
        })

        const loadResults = await Promise.all(promises)
        const totalTime = Date.now() - startTime

        // All requests should succeed
        loadResults.forEach(({ result }) => {
          expect(result.status).toBe(200)
        })

        const durations = loadResults.map(r => r.duration)
        const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
        const throughput = (load / totalTime) * 1000

        results.push({ load, avgDuration, throughput })

        console.log(`Load ${load}: ${avgDuration.toFixed(2)}ms avg, ${throughput.toFixed(2)} req/sec`);
      }

      // Performance should not degrade significantly with increased load
      const firstResult = results[0]
      const lastResult = results[results.length - 1]
      
      const performanceDegradation = (lastResult.avgDuration - firstResult.avgDuration) / firstResult.avgDuration
      
      console.log(`Performance degradation: ${(performanceDegradation * 100).toFixed(2)}%`);
      
      // Performance degradation should be reasonable (less than 200%)
      expect(performanceDegradation).toBeLessThan(2.0)
    })
  })
})