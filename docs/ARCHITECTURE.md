# Architecture Documentation

## Overview

This document describes the architecture and design patterns used in the Next.js backend application.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (Nuxt.js)     │◄──►│   (Next.js)     │◄──►│   (PostgreSQL)  │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   External      │
                       │   Services      │
                       │   (Email, etc.) │
                       └─────────────────┘
```

## Project Structure

```
backend/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   ├── auth/          # Authentication endpoints
│   │   ├── admin/         # Admin endpoints
│   │   ├── profile/       # User profile endpoints
│   │   └── health/        # Health check endpoints
│   └── layout.tsx         # Root layout
│
├── lib/                   # Core utilities
│   ├── prisma.ts         # Database client
│   ├── jwt-service.ts    # JWT token management
│   ├── session-service.ts # Session management
│   ├── api-response.ts   # Standardized API responses
│   ├── validators.ts     # Zod validation schemas
│   ├── logger.ts         # Logging utilities
│   └── utils.ts          # General utilities
│
├── services/              # Business logic layer
│   ├── user.service.ts   # User operations
│   └── email.service.ts  # Email operations
│
├── middlewares/           # Request middleware
│   ├── auth.ts           # Authentication middleware
│   ├── rate-limit.ts     # Rate limiting
│   ├── cors.ts           # CORS configuration
│   └── security.ts       # Security headers
│
├── prisma/               # Database layer
│   ├── schema.prisma     # Database schema
│   ├── migrations/       # Database migrations
│   └── seed.ts           # Database seeding
│
├── types/                # TypeScript definitions
│   └── next-auth.d.ts    # NextAuth type extensions
│
├── __tests__/            # Test suites
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   ├── performance/      # Performance tests
│   └── system/           # System tests
│
├── __mocks__/            # Test mocks
│   ├── @prisma/          # Prisma mocks
│   └── jose.js           # JWT mocks
│
└── docs/                 # Documentation
    ├── API.md            # API documentation
    ├── ARCHITECTURE.md   # This file
    ├── SECURITY.md       # Security guidelines
    └── CONTRIBUTING.md   # Contribution guidelines
```

## Design Patterns

### 1. Layered Architecture

The application follows a layered architecture pattern:

```
┌─────────────────────────────────────┐
│           Presentation Layer        │  ← API Routes (app/api/)
├─────────────────────────────────────┤
│           Business Logic Layer      │  ← Services (services/)
├─────────────────────────────────────┤
│           Data Access Layer         │  ← Prisma ORM (lib/prisma.ts)
├─────────────────────────────────────┤
│           Database Layer            │  ← PostgreSQL
└─────────────────────────────────────┘
```

### 2. Middleware Pattern

Request processing uses a middleware chain:

```
Request → CORS → Rate Limiting → Authentication → Authorization → Route Handler
```

### 3. Service Layer Pattern

Business logic is encapsulated in service classes:

```typescript
// services/user.service.ts
export class UserService {
  static async createUser(data: UserRegistration) {
    // Business logic for user creation
  }
  
  static async getUserById(id: string) {
    // Business logic for user retrieval
  }
}
```

### 4. Repository Pattern

Data access is abstracted through Prisma ORM:

```typescript
// lib/prisma.ts
export const prisma = new PrismaClient()

// Usage in services
const user = await prisma.user.findUnique({ where: { id } })
```

## Authentication Architecture

### JWT-based Authentication

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │  Database   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ 1. Login Request │                  │
       ├─────────────────►│                  │
       │                  │ 2. Verify User   │
       │                  ├─────────────────►│
       │                  │ 3. User Data     │
       │                  │◄─────────────────┤
       │ 4. JWT Token     │                  │
       │◄─────────────────┤                  │
       │                  │                  │
       │ 5. API Request   │                  │
       │    + JWT Token   │                  │
       ├─────────────────►│                  │
       │                  │ 6. Verify Token  │
       │                  │                  │
       │ 7. Response      │                  │
       │◄─────────────────┤                  │
```

### WebAuthn/Passkey Authentication

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │ Authenticator│
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ 1. Register Init │                  │
       ├─────────────────►│                  │
       │ 2. Challenge     │                  │
       │◄─────────────────┤                  │
       │ 3. Create Cred   │                  │
       ├─────────────────────────────────────►│
       │ 4. Credential    │                  │
       │◄─────────────────────────────────────┤
       │ 5. Verify Cred   │                  │
       ├─────────────────►│                  │
       │ 6. Success       │                  │
       │◄─────────────────┤                  │
```

## Database Design

### Entity Relationship Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│      User       │    │ WebAuthnCred    │    │   UserSession   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ id (PK)         │◄──►│ id (PK)         │    │ id (PK)         │
│ email           │    │ userId (FK)     │    │ userId (FK)     │
│ username        │    │ credentialID    │    │ token           │
│ password        │    │ publicKey       │    │ expiresAt       │
│ role            │    │ counter         │    │ createdAt       │
│ profilePicture  │    │ createdAt       │    └─────────────────┘
│ loginCount      │    └─────────────────┘           │
│ isLocked        │                                  │
│ lockedUntil     │    ┌─────────────────┐           │
│ createdAt       │    │ RefreshToken    │           │
│ updatedAt       │    ├─────────────────┤           │
│ lastLoginAt     │    │ id (PK)         │           │
└─────────────────┘    │ userId (FK)     │◄──────────┘
          │            │ token           │
          │            │ expiresAt       │
          │            │ createdAt       │
          │            └─────────────────┘
          │
          ▼
┌─────────────────┐
│   LoginAttempt  │
├─────────────────┤
│ id (PK)         │
│ userId (FK)     │
│ ipAddress       │
│ userAgent       │
│ success         │
│ createdAt       │
└─────────────────┘
```

## API Design Principles

### 1. RESTful Design

- Use HTTP methods appropriately (GET, POST, PUT, DELETE)
- Use meaningful resource URLs
- Return appropriate HTTP status codes
- Use consistent response formats

### 2. Consistent Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}
```

### 3. Input Validation

- Use Zod schemas for request validation
- Validate at the API boundary
- Return detailed validation errors

### 4. Error Handling

```typescript
try {
  // Business logic
} catch (error) {
  if (error instanceof ValidationError) {
    return ApiResponse.badRequest(error.message)
  }
  
  logger.error('Unexpected error', error)
  return ApiResponse.internalError()
}
```

## Security Architecture

### 1. Authentication & Authorization

- JWT tokens for stateless authentication
- Role-based access control (RBAC)
- WebAuthn for passwordless authentication
- Refresh token rotation

### 2. Input Security

- Request validation with Zod
- SQL injection prevention via Prisma ORM
- XSS protection through input sanitization
- CSRF protection via SameSite cookies

### 3. Rate Limiting

```typescript
// Different limits for different endpoints
const rateLimits = {
  auth: { requests: 5, window: '1m' },
  api: { requests: 100, window: '1m' },
  admin: { requests: 50, window: '1m' }
}
```

### 4. Security Headers

- CORS configuration
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options

## Performance Considerations

### 1. Database Optimization

- Proper indexing on frequently queried fields
- Connection pooling with Prisma
- Query optimization and N+1 prevention

### 2. Caching Strategy

```typescript
// Redis caching for frequently accessed data
const cacheKey = `user:${userId}`
const cached = await redis.get(cacheKey)

if (!cached) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  await redis.setex(cacheKey, 300, JSON.stringify(user))
  return user
}

return JSON.parse(cached)
```

### 3. Response Optimization

- Pagination for large datasets
- Field selection to reduce payload size
- Compression middleware

## Monitoring & Observability

### 1. Logging

```typescript
// Structured logging with Winston
logger.info('User login', {
  userId,
  email,
  ipAddress,
  userAgent,
  timestamp: new Date().toISOString()
})
```

### 2. Health Checks

- Database connectivity
- External service availability
- Memory and CPU usage
- Response time monitoring

### 3. Error Tracking

- Centralized error logging
- Error aggregation and alerting
- Performance monitoring

## Deployment Architecture

### Development

```
Local Machine
├── Next.js Dev Server (Port 3001)
├── PostgreSQL (Docker)
└── Redis (Docker)
```

### Production

```
Cloud Infrastructure
├── Load Balancer
├── Application Servers (Next.js)
├── Database Cluster (PostgreSQL)
├── Cache Layer (Redis)
└── CDN (Static Assets)
```

## Testing Strategy

### 1. Unit Tests

- Service layer functions
- Utility functions
- Validation schemas

### 2. Integration Tests

- API endpoint testing
- Database operations
- Authentication flows

### 3. Performance Tests

- Load testing with Artillery
- Database query performance
- Memory leak detection

### 4. Security Tests

- Authentication bypass attempts
- Input validation testing
- Rate limiting verification

## Future Considerations

### 1. Microservices Migration

- Service decomposition strategy
- API gateway implementation
- Inter-service communication

### 2. Event-Driven Architecture

- Event sourcing for audit trails
- Message queues for async processing
- Real-time notifications

### 3. Scalability Improvements

- Horizontal scaling strategies
- Database sharding
- Caching layers

## Best Practices

### 1. Code Organization

- Single Responsibility Principle
- Dependency Injection
- Interface segregation

### 2. Error Handling

- Graceful degradation
- Circuit breaker pattern
- Retry mechanisms

### 3. Documentation

- API documentation with examples
- Code comments for complex logic
- Architecture decision records (ADRs)

### 4. Version Control

- Feature branch workflow
- Conventional commit messages
- Automated testing in CI/CD