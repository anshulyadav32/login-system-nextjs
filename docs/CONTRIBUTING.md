# Contributing Guidelines

Thank you for your interest in contributing to this Next.js backend project! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Security Guidelines](#security-guidelines)
- [Documentation](#documentation)
- [Performance Guidelines](#performance-guidelines)
- [Troubleshooting](#troubleshooting)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be respectful**: Treat all contributors with respect and kindness
- **Be inclusive**: Welcome newcomers and help them get started
- **Be collaborative**: Work together to solve problems and improve the project
- **Be constructive**: Provide helpful feedback and suggestions
- **Be professional**: Maintain a professional tone in all communications

## Getting Started

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **PostgreSQL**: Version 14.0 or higher
- **Git**: Latest version
- **Docker**: Optional, for containerized development

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/your-username/project-name.git
cd project-name/backend
```

3. Add the upstream remote:

```bash
git remote add upstream https://github.com/original-owner/project-name.git
```

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env.local

# Edit the environment file with your settings
# Required variables:
# - DATABASE_URL
# - JWT_SECRET
# - NEXTAUTH_SECRET
# - EMAIL_SERVER_HOST (if using email features)
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed the database (optional)
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 5. Verify Setup

```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Run tests
npm test

# Run linting
npm run lint
```

## Project Structure

```
backend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── users/        # User management
│   │   └── admin/        # Admin endpoints
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── lib/                   # Core utilities
│   ├── db.ts             # Database client
│   ├── auth.ts           # Authentication helpers
│   ├── validators.ts     # Zod schemas
│   ├── logger.ts         # Logging utility
│   └── utils.ts          # Common utilities
├── services/              # Business logic
│   ├── user.service.ts   # User operations
│   └── email.service.ts  # Email operations
├── middlewares/           # API middleware
│   ├── auth.ts           # Authentication middleware
│   ├── rate-limit.ts     # Rate limiting
│   ├── cors.ts           # CORS configuration
│   └── security.ts       # Security headers
├── types/                 # TypeScript definitions
├── __tests__/             # Test files
├── __mocks__/             # Mock data
├── prisma/                # Database schema and migrations
└── docs/                  # Documentation
```

## Coding Standards

### TypeScript Guidelines

```typescript
// Use explicit types for function parameters and return values
function createUser(userData: CreateUserInput): Promise<User> {
  // Implementation
}

// Use interfaces for object shapes
interface User {
  id: string
  email: string
  username: string
  createdAt: Date
}

// Use enums for constants
enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

// Use utility types when appropriate
type CreateUserInput = Omit<User, 'id' | 'createdAt'>
type UpdateUserInput = Partial<CreateUserInput>
```

### Naming Conventions

- **Files**: Use kebab-case (`user-service.ts`, `rate-limit.ts`)
- **Directories**: Use kebab-case (`__tests__`, `api-routes`)
- **Variables/Functions**: Use camelCase (`getUserById`, `isAuthenticated`)
- **Constants**: Use UPPER_SNAKE_CASE (`MAX_LOGIN_ATTEMPTS`, `JWT_EXPIRY`)
- **Classes/Interfaces**: Use PascalCase (`UserService`, `AuthConfig`)
- **Types**: Use PascalCase (`CreateUserInput`, `ApiResponse`)

### Code Organization

```typescript
// File structure template
// 1. Imports (external libraries first, then internal)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authenticateUser } from '@/lib/auth'
import { createUser } from '@/services/user.service'
import { logger } from '@/lib/logger'

// 2. Types and interfaces
interface CreateUserRequest {
  email: string
  username: string
  password: string
}

// 3. Constants
const MAX_USERNAME_LENGTH = 30

// 4. Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(MAX_USERNAME_LENGTH),
  password: z.string().min(8)
})

// 5. Main function
export async function POST(request: NextRequest) {
  // Implementation
}

// 6. Helper functions (if any)
function validateInput(data: unknown): CreateUserRequest {
  // Implementation
}
```

### Error Handling

```typescript
// Use custom error classes
class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Handle errors consistently
try {
  const result = await riskyOperation()
  return NextResponse.json({ success: true, data: result })
} catch (error) {
  logger.error('Operation failed', { error, context: 'user-creation' })
  
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: 'Validation failed', field: error.field },
      { status: 400 }
    )
  }
  
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

## Testing Guidelines

### Test Structure

```typescript
// test-file.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { createMockUser, cleanupTestData } from '../__mocks__/user.mock'

describe('UserService', () => {
  beforeEach(async () => {
    // Setup test data
  })
  
  afterEach(async () => {
    // Cleanup test data
    await cleanupTestData()
  })
  
  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      // Arrange
      const userData = createMockUser()
      
      // Act
      const result = await userService.createUser(userData)
      
      // Assert
      expect(result).toBeDefined()
      expect(result.email).toBe(userData.email)
    })
    
    it('should throw error for invalid email', async () => {
      // Arrange
      const userData = createMockUser({ email: 'invalid-email' })
      
      // Act & Assert
      await expect(userService.createUser(userData))
        .rejects
        .toThrow('Invalid email format')
    })
  })
})
```

### Test Categories

1. **Unit Tests**: Test individual functions and methods
2. **Integration Tests**: Test API endpoints and database operations
3. **E2E Tests**: Test complete user workflows

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test user.service.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="create user"
```

### Test Requirements

- **Coverage**: Maintain minimum 80% code coverage
- **Isolation**: Tests should not depend on each other
- **Cleanup**: Always clean up test data
- **Mocking**: Mock external dependencies
- **Assertions**: Use descriptive assertion messages

## Commit Guidelines

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **perf**: Performance improvements
- **security**: Security improvements

### Examples

```bash
# Good commit messages
feat(auth): add WebAuthn passkey support
fix(users): resolve duplicate email validation
docs(api): update authentication endpoints
test(auth): add integration tests for login flow
refactor(services): extract email service logic
security(auth): implement rate limiting for login

# Bad commit messages
fix stuff
update code
working on auth
```

### Commit Best Practices

- **Atomic commits**: One logical change per commit
- **Descriptive messages**: Explain what and why, not how
- **Present tense**: Use imperative mood ("add" not "added")
- **Line length**: Keep subject line under 50 characters
- **Body**: Explain complex changes in the body

## Pull Request Process

### Before Creating a PR

1. **Update your branch**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run quality checks**:
   ```bash
   npm run lint
   npm run type-check
   npm test
   npm run build
   ```

3. **Update documentation** if needed

### PR Requirements

- [ ] **Descriptive title**: Clear and concise
- [ ] **Detailed description**: Explain the changes and motivation
- [ ] **Issue reference**: Link to related issues
- [ ] **Tests**: Add or update tests for new functionality
- [ ] **Documentation**: Update relevant documentation
- [ ] **No breaking changes**: Or clearly document them
- [ ] **Clean commit history**: Squash or rebase if necessary

### PR Template

```markdown
## Description

Brief description of the changes.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issues

Fixes #123
Related to #456

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings or errors
```

### Review Process

1. **Automated checks**: CI/CD pipeline must pass
2. **Code review**: At least one approval required
3. **Testing**: Reviewer should test the changes
4. **Documentation**: Verify documentation is updated
5. **Security**: Check for security implications

## Security Guidelines

### Secure Coding Practices

```typescript
// Input validation
const userInput = validateInput(request.body, userSchema)

// Parameterized queries (Prisma handles this)
const user = await prisma.user.findUnique({
  where: { email: userInput.email }
})

// Secure password hashing
const hashedPassword = await bcrypt.hash(password, 12)

// Safe error messages (don't leak sensitive info)
if (!user) {
  return NextResponse.json(
    { error: 'Invalid credentials' }, // Generic message
    { status: 401 }
  )
}
```

### Security Checklist

- [ ] **Input validation**: All inputs validated with Zod schemas
- [ ] **Authentication**: Proper authentication checks
- [ ] **Authorization**: Role-based access control
- [ ] **Rate limiting**: Implement for sensitive endpoints
- [ ] **Error handling**: No sensitive data in error messages
- [ ] **Logging**: Log security events appropriately
- [ ] **Dependencies**: Keep dependencies updated

## Documentation

### Code Documentation

```typescript
/**
 * Creates a new user account with the provided information.
 * 
 * @param userData - The user registration data
 * @param userData.email - User's email address (must be unique)
 * @param userData.username - User's chosen username (3-30 characters)
 * @param userData.password - User's password (minimum 8 characters)
 * @returns Promise resolving to the created user (without password)
 * 
 * @throws {ValidationError} When input data is invalid
 * @throws {ConflictError} When email or username already exists
 * 
 * @example
 * ```typescript
 * const user = await createUser({
 *   email: 'user@example.com',
 *   username: 'johndoe',
 *   password: 'securePassword123'
 * })
 * ```
 */
export async function createUser(userData: CreateUserInput): Promise<User> {
  // Implementation
}
```

### API Documentation

Update `docs/API.md` when adding or modifying endpoints:

```markdown
### POST /api/users

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securePassword123"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "johndoe",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```
```

## Performance Guidelines

### Database Optimization

```typescript
// Use select to limit returned fields
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    username: true
    // Don't select password or other sensitive fields
  }
})

// Use pagination for large datasets
const users = await prisma.user.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' }
})

// Use transactions for related operations
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData })
  await tx.profile.create({ data: { userId: user.id, ...profileData } })
  return user
})
```

### Caching Strategy

```typescript
// Cache frequently accessed data
const getCachedUser = async (userId: string): Promise<User | null> => {
  const cacheKey = `user:${userId}`
  
  // Try cache first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }
  
  // Fetch from database
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  // Cache for 5 minutes
  if (user) {
    await redis.setex(cacheKey, 300, JSON.stringify(user))
  }
  
  return user
}
```

### Performance Monitoring

```typescript
// Add performance logging
const startTime = Date.now()
try {
  const result = await expensiveOperation()
  logger.info('Operation completed', {
    operation: 'expensiveOperation',
    duration: Date.now() - startTime,
    success: true
  })
  return result
} catch (error) {
  logger.error('Operation failed', {
    operation: 'expensiveOperation',
    duration: Date.now() - startTime,
    error: error.message
  })
  throw error
}
```

## Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database connection
npx prisma db pull

# Reset database (development only)
npx prisma migrate reset

# Check database status
npx prisma studio
```

#### Environment Variables

```bash
# Verify environment variables are loaded
node -e "console.log(process.env.DATABASE_URL ? 'DB URL set' : 'DB URL missing')"

# Check for missing variables
npm run env:check
```

#### Build Issues

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npx tsc --noEmit
```

### Getting Help

1. **Check existing issues**: Search GitHub issues first
2. **Read documentation**: Check `docs/` directory
3. **Ask questions**: Create a discussion or issue
4. **Join community**: Discord/Slack channels (if available)

### Debugging Tips

```typescript
// Use structured logging
logger.debug('Processing user request', {
  userId,
  action: 'updateProfile',
  timestamp: new Date().toISOString()
})

// Add request tracing
const requestId = crypto.randomUUID()
logger.info('Request started', { requestId, path: request.url })

// Use proper error boundaries
try {
  // Risky operation
} catch (error) {
  logger.error('Operation failed', {
    requestId,
    error: error.message,
    stack: error.stack
  })
  throw error
}
```

## Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **Prisma Documentation**: https://www.prisma.io/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs
- **Jest Testing Framework**: https://jestjs.io/docs
- **Zod Validation**: https://zod.dev

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing! 🚀