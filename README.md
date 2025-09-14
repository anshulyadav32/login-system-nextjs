# Next.js Backend API

A modern, secure, and scalable backend API built with Next.js 14, featuring JWT and WebAuthn authentication, comprehensive user management, and enterprise-grade security.

## 🚀 Features

### Authentication & Security
- **Dual Authentication**: JWT tokens + WebAuthn/Passkey support
- **Multi-Factor Authentication**: Biometric and hardware security keys
- **Rate Limiting**: Configurable rate limits for different endpoints
- **Security Headers**: Comprehensive security middleware
- **Input Validation**: Zod schema validation for all inputs
- **Password Security**: bcrypt hashing with configurable rounds

### User Management
- **User Registration & Login**: Secure account creation and authentication
- **Profile Management**: Update user profiles and profile pictures
- **Username Changes**: Secure username modification with validation
- **Admin Panel**: Administrative user management capabilities
- **Session Management**: Secure session handling with refresh tokens

### API Features
- **RESTful Design**: Clean, consistent API endpoints
- **Type Safety**: Full TypeScript implementation
- **Error Handling**: Comprehensive error responses
- **Logging**: Structured logging with Winston
- **Health Checks**: System health monitoring endpoints
- **CORS Support**: Configurable cross-origin resource sharing

### Database & Performance
- **Prisma ORM**: Type-safe database operations
- **PostgreSQL**: Robust relational database
- **Connection Pooling**: Optimized database connections
- **Migrations**: Version-controlled database schema
- **Indexing**: Optimized database queries

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **PostgreSQL**: Version 14.0 or higher
- **Git**: Latest version

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd next-nust-js/backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

```bash
# Copy the environment template
cp .env.example .env.local

# Edit the environment file with your configuration
nano .env.local
```

#### Required Environment Variables

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-here"
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# WebAuthn
WEBAUTHN_RP_NAME="Your App Name"
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_ORIGIN="http://localhost:3000"

# Email (Optional)
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASSWORD="your-app-password"
EMAIL_FROM="noreply@yourapp.com"

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Environment
NODE_ENV="development"
```

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed the database (optional)
npx prisma db seed
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- auth
```

### Test Categories

- **Unit Tests**: Individual function and method testing
- **Integration Tests**: API endpoint and database testing
- **System Tests**: End-to-end workflow testing
- **Performance Tests**: Load and stress testing

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123!"
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer <refresh_token>
```

### User Management

#### Get Profile
```http
GET /api/profile
Authorization: Bearer <access_token>
```

#### Update Profile
```http
PUT /api/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "username": "newusername",
  "email": "newemail@example.com"
}
```

#### Change Username
```http
POST /api/auth/change-username
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "newUsername": "mynewusername"
}
```

### WebAuthn/Passkey Endpoints

#### Register Passkey
```http
POST /api/auth/webauthn/register/begin
Authorization: Bearer <access_token>
```

#### Authenticate with Passkey
```http
POST /api/auth/webauthn/authenticate/begin
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Admin Endpoints

#### Get All Users (Admin)
```http
GET /api/admin/users
Authorization: Bearer <admin_access_token>
```

#### Update User (Admin)
```http
PUT /api/admin/users/:id
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "username": "newusername",
  "role": "USER"
}
```

### Health Check

```http
GET /api/health
```

For complete API documentation, see [docs/API.md](./docs/API.md)

## 🏗️ Project Structure

```
backend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── users/        # User management
│   │   ├── admin/        # Admin endpoints
│   │   └── health/       # Health check
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── lib/                   # Core utilities
│   ├── db.ts             # Database client
│   ├── auth.ts           # Authentication helpers
│   ├── validators.ts     # Zod schemas
│   ├── logger.ts         # Logging utility
│   ├── utils.ts          # Common utilities
│   └── api-response.ts   # Response handlers
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
├── docs/                  # Documentation
└── scripts/               # Utility scripts
```

## 🔧 Configuration

### Rate Limiting

```typescript
// Configure in middlewares/rate-limit.ts
export const RATE_LIMIT_CONFIGS = {
  auth: {
    windowMs: 60 * 1000,    // 1 minute
    max: 5,                 // 5 attempts per minute
  },
  api: {
    windowMs: 60 * 1000,    // 1 minute
    max: 100,               // 100 requests per minute
  }
}
```

### Security Headers

```typescript
// Configure in middlewares/security.ts
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}
```

### CORS Settings

```typescript
// Configure in middlewares/cors.ts
const corsOptions = {
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}
```

## 🚀 Deployment

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t nextjs-backend .

# Run container
docker run -p 3000:3000 --env-file .env.prod nextjs-backend
```

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel --prod
```

### Environment Variables for Production

```env
NODE_ENV=production
DATABASE_URL=<production-database-url>
JWT_SECRET=<strong-production-secret>
NEXTAUTH_SECRET=<strong-production-secret>
NEXTAUTH_URL=<production-domain>
```

## 📊 Monitoring & Logging

### Logging Levels

- **ERROR**: System errors and exceptions
- **WARN**: Warning messages and potential issues
- **INFO**: General information and API requests
- **DEBUG**: Detailed debugging information

### Health Monitoring

```bash
# Check application health
curl http://localhost:3000/api/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "memory": {
    "used": "45.2 MB",
    "total": "128 MB"
  }
}
```

## 🔒 Security

### Security Features

- **Input Validation**: All inputs validated with Zod schemas
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **XSS Protection**: Content Security Policy headers
- **CSRF Protection**: SameSite cookie attributes
- **Rate Limiting**: Configurable rate limits per endpoint
- **Password Security**: bcrypt with configurable rounds
- **JWT Security**: Secure token generation and validation
- **WebAuthn Support**: FIDO2 compliant authentication

### Security Best Practices

1. **Environment Variables**: Never commit secrets to version control
2. **HTTPS Only**: Use HTTPS in production
3. **Regular Updates**: Keep dependencies updated
4. **Security Headers**: Implement comprehensive security headers
5. **Input Validation**: Validate all user inputs
6. **Error Handling**: Don't expose sensitive information in errors
7. **Logging**: Log security events for monitoring

For detailed security information, see [docs/SECURITY.md](./docs/SECURITY.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./docs/CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **Jest**: Unit and integration testing
- **Conventional Commits**: Standardized commit messages

## 📖 Documentation

- [API Documentation](./docs/API.md) - Complete API reference
- [Architecture Guide](./docs/ARCHITECTURE.md) - System design and patterns
- [Security Guide](./docs/SECURITY.md) - Security implementation details
- [Contributing Guide](./docs/CONTRIBUTING.md) - Development guidelines

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Check database connection
npx prisma db pull

# Reset database (development only)
npx prisma migrate reset
```

#### Environment Variables Not Loading

```bash
# Verify environment file exists
ls -la .env.local

# Check environment variables
node -e "console.log(process.env.DATABASE_URL ? 'DB URL set' : 'DB URL missing')"
```

#### Build Errors

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript Errors

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Generate Prisma client
npx prisma generate
```

### Getting Help

1. Check the [documentation](./docs/)
2. Search existing [GitHub issues](https://github.com/your-repo/issues)
3. Create a new issue with detailed information
4. Join our community discussions

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React framework for production
- [Prisma](https://www.prisma.io/) - Next-generation ORM for Node.js
- [NextAuth.js](https://next-auth.js.org/) - Authentication for Next.js
- [Zod](https://zod.dev/) - TypeScript-first schema validation
- [Winston](https://github.com/winstonjs/winston) - Logging library
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) - Password hashing

## 📊 Project Status

- ✅ Authentication System (JWT + WebAuthn)
- ✅ User Management
- ✅ Admin Panel
- ✅ Security Middleware
- ✅ Rate Limiting
- ✅ Input Validation
- ✅ Comprehensive Testing
- ✅ Documentation
- ✅ Docker Support
- ✅ Production Ready

---

**Built with ❤️ using Next.js, TypeScript, and modern web technologies.**