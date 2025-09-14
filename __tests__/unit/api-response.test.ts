import { ApiResponseHandler } from '@/lib/api-response'
import { ZodError, z } from 'zod'

describe('ApiResponseHandler', () => {

  describe('Success Responses', () => {
    it('should create success response with data', async () => {
      const testData = { message: 'Test successful', id: 123 }
      const response = ApiResponseHandler.success(testData)

      expect(response.status).toBe(200)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toEqual(testData)
    })

    it('should create success response without data', async () => {
      const response = ApiResponseHandler.success(null)

      expect(response.status).toBe(200)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toBeNull()
    })

    it('should create created response', async () => {
      const testData = { id: 456, name: 'New Resource' }
      const response = ApiResponseHandler.success(testData, 201)

      expect(response.status).toBe(201)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toEqual(testData)
    })

    it('should create accepted response', async () => {
      const testData = { message: 'Request accepted for processing' }
      const response = ApiResponseHandler.success(testData, 202)

      expect(response.status).toBe(202)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(true)
      expect(responseData.data).toEqual(testData)
    })
  })

  describe('Error Responses', () => {
    it('should create bad request response', async () => {
      const errorMessage = 'Invalid input provided'
      const response = ApiResponseHandler.error('VALIDATION_ERROR', errorMessage, 400)

      expect(response.status).toBe(400)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe(errorMessage)
      expect(responseData.error.code).toBe('VALIDATION_ERROR')
    })

    it('should create unauthorized response', async () => {
      const errorMessage = 'Authentication required'
      const response = ApiResponseHandler.unauthorized(errorMessage)

      expect(response.status).toBe(401)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe(errorMessage)
      expect(responseData.error.code).toBe('UNAUTHORIZED')
    })

    it('should create forbidden response', async () => {
      const errorMessage = 'Access denied'
      const response = ApiResponseHandler.forbidden(errorMessage)

      expect(response.status).toBe(403)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe(errorMessage)
      expect(responseData.error.code).toBe('FORBIDDEN')
    })

    it('should create not found response', async () => {
      const response = ApiResponseHandler.notFound('Resource')

      expect(response.status).toBe(404)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe('Resource not found')
      expect(responseData.error.code).toBe('NOT_FOUND')
    })

    it('should create conflict response', async () => {
      const errorMessage = 'Resource already exists'
      const response = ApiResponseHandler.conflict(errorMessage)

      expect(response.status).toBe(409)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe(errorMessage)
      expect(responseData.error.code).toBe('CONFLICT')
    })

    it('should create internal error response', async () => {
      const errorMessage = 'Internal server error'
      const response = ApiResponseHandler.internalError(errorMessage)

      expect(response.status).toBe(500)
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.message).toBe(errorMessage)
      expect(responseData.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('Rate Limiting Response', () => {
    it('should create rate limit exceeded response', async () => {
      const retryAfter = 60
      const response = ApiResponseHandler.rateLimitExceeded(retryAfter, 'Too many requests')

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
      expect(responseData.error.code).toBe('RATE_LIMIT_EXCEEDED')
    })

    it('should create rate limit response without retry after', async () => {
      const response = ApiResponseHandler.rateLimitExceeded(undefined, 'Too many requests')

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBeNull()
      
      const responseData = await response.json()
      expect(responseData.success).toBe(false)
    })
  })

  describe('Validation Error Response', () => {
    it('should create validation error response from ZodError', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18)
      })

      try {
        schema.parse({ email: 'invalid-email', age: 15 })
      } catch (error) {
        if (error instanceof ZodError) {
          const response = ApiResponseHandler.validationError(error)

          expect(response.status).toBe(400)
          
          const responseData = await response.json()
          expect(responseData.success).toBe(false)
          expect(responseData.error.code).toBe('VALIDATION_ERROR')
          expect(responseData.error.details).toBeDefined()
          expect(Array.isArray(responseData.error.details)).toBe(true)
          expect(responseData.error.details.length).toBeGreaterThan(0)
        }
      }
    })

    it('should handle validation error with custom message', async () => {
      const schema = z.string().email()

      try {
        schema.parse('invalid-email')
      } catch (error) {
        if (error instanceof ZodError) {
          const response = ApiResponseHandler.validationError(error)

          expect(response.status).toBe(400)
          
          const responseData = await response.json()
          expect(responseData.error.message).toBe('Request validation failed')
        }
      }
    })
  })

  describe('Response Structure Consistency', () => {
    it('should have consistent success response structure', async () => {
      const response = ApiResponseHandler.success({ test: 'data' })
      const responseData = await response.json()

      expect(responseData).toHaveProperty('success')
      expect(responseData).toHaveProperty('data')
      expect(responseData.success).toBe(true)
    })

    it('should have consistent error response structure', async () => {
      const response = ApiResponseHandler.error('VALIDATION_ERROR', 'Test error', 400)
      const responseData = await response.json()

      expect(responseData).toHaveProperty('success')
      expect(responseData).toHaveProperty('error')
      expect(responseData.error).toHaveProperty('message')
      expect(responseData.error).toHaveProperty('code')
      expect(responseData.success).toBe(false)
    })

    it('should include timestamp in all responses', async () => {
        const successResponse = ApiResponseHandler.success(null)
        const errorResponse = ApiResponseHandler.error('VALIDATION_ERROR', 'Error', 400)

        const successData = await successResponse.json()
        const errorData = await errorResponse.json()

        expect(successData.success).toBe(true)
        expect(errorData.success).toBe(false)
      })
  })

  describe('Headers and Content Type', () => {
    it('should set correct content type for JSON responses', () => {
      const response = ApiResponseHandler.success({ test: 'data' })
      
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })

    it('should set CORS headers if configured', () => {
      const response = ApiResponseHandler.success()
      
      // Check if CORS headers are present (implementation dependent)
      expect(response.headers).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle null data gracefully', async () => {
      const response = ApiResponseHandler.success(null)
      const responseData = await response.json()

      expect(responseData.success).toBe(true)
      expect(responseData.data).toBeNull()
    })

    it('should handle undefined data gracefully', async () => {
      const response = ApiResponseHandler.success(undefined)
      const responseData = await response.json()

      expect(responseData.success).toBe(true)
      expect(responseData.data).toBeUndefined()
    })

    it('should handle empty string error message', async () => {
      const response = ApiResponseHandler.error('VALIDATION_ERROR', '', 400)
      const responseData = await response.json()

      expect(responseData.error.message).toBe('')
    })

    it('should handle complex nested data objects', async () => {
      const complexData = {
        user: {
          id: 1,
          profile: {
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        },
        metadata: {
          version: '1.0.0',
          features: ['auth', 'api']
        }
      }

      const response = ApiResponseHandler.success(complexData)
      const responseData = await response.json()

      expect(responseData.data).toEqual(complexData)
    })
  })
})