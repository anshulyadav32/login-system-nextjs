import { NextRequest } from 'next/server'
import { GET as healthGet } from './app/api/health/route'
import { GET as statusGet } from './app/status/route'
import { GET as testGet, POST as testPost } from './app/test/route'
import { GET as rootGet } from './app/route'
import { prisma } from './lib/prisma'
import bcrypt from 'bcryptjs'

// Mock NextRequest for testing
function createMockRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(url, {
    ...options,
    signal: options.signal === null ? undefined : options.signal
  })
}

// Test utilities
class TestRunner {
  private testResults: { name: string; status: 'PASS' | 'FAIL'; error?: string }[] = []
  private totalTests = 0
  private passedTests = 0

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    this.totalTests++
    try {
      await testFn()
      this.testResults.push({ name, status: 'PASS' })
      this.passedTests++
      console.log(`✅ ${name}`);
    } catch (error) {
      this.testResults.push({ 
        name, 
        status: 'FAIL', 
        error: error instanceof Error ? error.message : String(error) 
      })
      console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(50))
    console.log('TEST SUMMARY')
    console.log('='.repeat(50))
    console.log(`Total Tests: ${this.totalTests}`)
    console.log(`Passed: ${this.passedTests}`)
    console.log(`Failed: ${this.totalTests - this.passedTests}`)
    console.log(`Success Rate: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`)
    
    if (this.testResults.some(r => r.status === 'FAIL')) {
      console.log('\nFAILED TESTS:')
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`))
    }
    console.log('='.repeat(50))
  }
}

// Database test utilities
class DatabaseTestUtils {
  static async createTestUser(username: string = 'testuser', email: string = 'test@example.com') {
    const hashedPassword = await bcrypt.hash('testpassword123', 10)
    return await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: 'user'
      }
    })
  }

  static async cleanupTestUsers() {
    await prisma.webAuthnCredential.deleteMany({
      where: {
        user: {
          username: {
            startsWith: 'test'
          }
        }
      }
    })
    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'test'
        }
      }
    })
  }
}

// API Response validator
class ResponseValidator {
  static async validateJsonResponse(response: Response, expectedStatus: number = 200) {
    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`)
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Response is not JSON')
    }
    
    return await response.json()
  }

  static validateRequiredFields(obj: any, fields: string[]) {
    for (const field of fields) {
      if (!(field in obj)) {
        throw new Error(`Missing required field: ${field}`)
      }
    }
  }
}

// Main test suite
async function runAllTests() {
  const runner = new TestRunner()
  
  console.log('🚀 Starting API Test Suite...')
  console.log('='.repeat(50))

  // Test 1: Root API endpoint
  await runner.runTest('Root API Endpoint', async () => {
    const request = createMockRequest('http://localhost:3001/')
    const response = await rootGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['message', 'version', 'endpoints', 'status'])
    
    if (data.status !== 'running') {
      throw new Error('API status is not running')
    }
  })

  // Test 2: Health check endpoint
  await runner.runTest('Health Check Endpoint', async () => {
    const request = createMockRequest('http://localhost:3001/api/health')
    const response = await healthGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['status', 'timestamp'])
    
    if (data.status !== 'ok') {
      throw new Error('Health check failed')
    }
  })

  // Test 3: Status endpoint
  await runner.runTest('Status Endpoint', async () => {
    const response = await statusGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['status', 'timestamp', 'server'])
  })

  // Test 4: Test endpoint GET
  await runner.runTest('Test Endpoint GET', async () => {
    const response = await testGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['status', 'message', 'timestamp'])
    
    if (data.status !== 'ok') {
      throw new Error('Test endpoint status is not ok')
    }
  })

  // Test 5: Test endpoint POST
  await runner.runTest('Test Endpoint POST', async () => {
    const testData = { test: 'data', number: 123 }
    const request = createMockRequest('http://localhost:3001/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    })
    
    const response = await testPost(request)
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['status', 'received', 'timestamp'])
    
    if (data.status !== 'success') {
      throw new Error('Test POST endpoint failed')
    }
    
    if (JSON.stringify(data.received) !== JSON.stringify(testData)) {
      throw new Error('POST data not received correctly')
    }
  })

  // Test 6: Test endpoint POST with invalid JSON
  await runner.runTest('Test Endpoint POST Invalid JSON', async () => {
    const request = createMockRequest('http://localhost:3001/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json'
    })
    
    const response = await testPost(request)
    const data = await ResponseValidator.validateJsonResponse(response, 400)
    
    if (data.status !== 'error') {
      throw new Error('Expected error status for invalid JSON')
    }
  })

  // Test 7: Database connection test
  await runner.runTest('Database Connection', async () => {
    try {
      await prisma.$connect()
      const result = await prisma.$queryRaw`SELECT 1 as test`
      if (!result) {
        throw new Error('Database query failed')
      }
    } catch (error) {
      throw new Error(`Database connection failed: ${error}`)
    }
  })

  // Test 8: User creation and retrieval
  await runner.runTest('User CRUD Operations', async () => {
    // Cleanup first
    await DatabaseTestUtils.cleanupTestUsers()
    
    // Create test user
    const user = await DatabaseTestUtils.createTestUser('testuser_crud', 'crud@test.com')
    
    if (!user.id || !user.username || !user.email) {
      throw new Error('User creation failed')
    }
    
    // Retrieve user
    const retrievedUser = await prisma.user.findUnique({
      where: { id: user.id }
    })
    
    if (!retrievedUser || retrievedUser.username !== 'testuser_crud') {
      throw new Error('User retrieval failed')
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' }
    })
    
    if (updatedUser.role !== 'admin') {
      throw new Error('User update failed')
    }
    
    // Cleanup
    await prisma.user.delete({ where: { id: user.id } })
  })

  // Test 9: Password hashing validation
  await runner.runTest('Password Hashing', async () => {
    const password = 'testpassword123'
    const hashedPassword = await bcrypt.hash(password, 10)
    
    if (!hashedPassword || hashedPassword === password) {
      throw new Error('Password hashing failed')
    }
    
    const isValid = await bcrypt.compare(password, hashedPassword)
    if (!isValid) {
      throw new Error('Password comparison failed')
    }
    
    const isInvalid = await bcrypt.compare('wrongpassword', hashedPassword)
    if (isInvalid) {
      throw new Error('Password comparison should have failed')
    }
  })

  // Test 10: Environment variables
  await runner.runTest('Environment Configuration', async () => {
    const requiredEnvVars = ['DATABASE_URL']
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing environment variable: ${envVar}`)
      }
    }
  })

  // Test 11: Prisma schema validation
  await runner.runTest('Prisma Schema Validation', async () => {
    try {
      // Test if we can access all main models
      const userCount = await prisma.user.count()
      const credentialCount = await prisma.webAuthnCredential.count()
      
      if (typeof userCount !== 'number' || typeof credentialCount !== 'number') {
        throw new Error('Prisma model access failed')
      }
    } catch (error) {
      throw new Error(`Prisma schema validation failed: ${error}`)
    }
  })

  // Test 12: WebAuthn credential operations
  await runner.runTest('WebAuthn Credential Operations', async () => {
    // Cleanup first
    await DatabaseTestUtils.cleanupTestUsers()
    
    // Create test user
    const user = await DatabaseTestUtils.createTestUser('testuser_webauthn', 'webauthn@test.com')
    
    // Create WebAuthn credential
    const credential = await prisma.webAuthnCredential.create({
      data: {
        credentialID: 'test-credential-id',
        credentialPublicKey: Buffer.from('test-public-key'),
        counter: 0,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        userId: user.id
      }
    })
    
    if (!credential.id || credential.credentialID !== 'test-credential-id') {
      throw new Error('WebAuthn credential creation failed')
    }
    
    // Retrieve credential with user
    const credentialWithUser = await prisma.webAuthnCredential.findUnique({
      where: { id: credential.id },
      include: { user: true }
    })
    
    if (!credentialWithUser || credentialWithUser.user.username !== 'testuser_webauthn') {
      throw new Error('WebAuthn credential retrieval with user failed')
    }
    
    // Cleanup
    await prisma.webAuthnCredential.delete({ where: { id: credential.id } })
    await prisma.user.delete({ where: { id: user.id } })
  })

  // Final cleanup
  await runner.runTest('Final Cleanup', async () => {
    await DatabaseTestUtils.cleanupTestUsers()
    await prisma.$disconnect()
  })

  runner.printSummary()
  
  // Exit with appropriate code
  const failedTests = runner['totalTests'] - runner['passedTests']
  if (failedTests > 0) {
    console.log(`\n❌ ${failedTests} test(s) failed. Exiting with code 1.`)
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed! 🎉')
    process.exit(0)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Test suite failed:', error)
    process.exit(1)
  })
}

export { runAllTests, TestRunner, DatabaseTestUtils, ResponseValidator }