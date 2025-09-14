import { NextRequest } from 'next/server'
import { GET as healthGet } from './app/api/health/route'
import { GET as statusGet } from './app/api/status/route'
import { GET as testGet, POST as testPost } from './app/test/route'
import { GET as rootGet } from './app/route'

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
    console.log('API-ONLY TEST SUMMARY')
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

  getExitCode(): number {
    return this.testResults.some(r => r.status === 'FAIL') ? 1 : 0
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

// Main test suite - API endpoints only
async function runApiTests() {
  const runner = new TestRunner()
  
  console.log('🚀 Starting API-Only Test Suite...')
  console.log('='.repeat(50))

  // Test 1: Root API endpoint
  await runner.runTest('Root API Endpoint', async () => {
    const response = await rootGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['message', 'version', 'endpoints', 'status'])
    
    if (data.status !== 'running') {
      throw new Error('API status is not running')
    }
  })

  // Test 2: Health check endpoint
  await runner.runTest('Health Check Endpoint', async () => {
    const response = await healthGet()
    const data = await ResponseValidator.validateJsonResponse(response)
    
    ResponseValidator.validateRequiredFields(data, ['status', 'timestamp'])
    
    if (data.status !== 'ok') {
      throw new Error('Health check failed')
    }
  })

  // Test 3: Status endpoint (without database)
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

  runner.printSummary()
  
  if (runner.getExitCode() === 1) {
    console.log('\n❌ Some tests failed. Exiting with code 1.')
    process.exit(1)
  } else {
    console.log('\n✅ All API tests passed!')
    process.exit(0)
  }
}

// Run the tests
runApiTests().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})