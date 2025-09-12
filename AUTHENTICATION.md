# Authentication System Documentation

## Overview

This Next.js application includes a production-ready authentication system with Prisma database integration and the following features:

- **Database Integration**: Prisma ORM with SQLite (easily configurable for PostgreSQL/MySQL)
- **Secure Password Hashing**: Uses bcryptjs with salt rounds of 12
- **Input Validation**: Zod schemas for all API endpoints
- **Session Management**: NextAuth.js v5 with JWT tokens
- **User Registration**: Complete signup flow with validation
- **Profile Management**: Users can update email, username, and profile pictures
- **Admin Dashboard**: Role-based access control
- **Username Changes**: Secure username update functionality

## Key Features

- **Secure Password Hashing**: Uses bcryptjs with salt rounds for secure password storage
- **User Registration**: Complete registration API with validation
- **JWT Authentication**: NextAuth.js with JWT strategy
- **Role-Based Access**: Support for user, admin, and super_admin roles
- **Profile Management**: Update user profiles, usernames, and profile pictures
- **Admin Dashboard**: Admin-only endpoints with user statistics

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/signin` - User login (NextAuth.js)
- `POST /api/auth/signout` - User logout (NextAuth.js)

### Profile Management
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `POST /api/profile/picture` - Upload profile picture
- `DELETE /api/profile/picture` - Remove profile picture
- `POST /api/auth/change-username` - Change username

### Admin
- `GET /api/admin` - Admin dashboard data (admin/super_admin only)

## Key Components

### Prisma Database Integration
The application now uses Prisma ORM with:
- **Database Schema**: `/prisma/schema.prisma` defines the User model
- **Prisma Client**: `/lib/prisma.ts` provides database connection
- **User Service**: `/lib/prisma-user-service.ts` handles all user operations
- **Migrations**: Automatic database schema management
- **Seeding**: Default admin user creation

### Methods
- `createUser(userData)` - Create new user with hashed password
- `findByEmail(email)` - Find user by email
- `findById(id)` - Find user by ID
- `findByUsername(username)` - Find user by username
- `updateUser(id, updates)` - Update user data
- `verifyPassword(plain, hashed)` - Verify password
- `getAllUsers()` - Get all users
- `getUserStats()` - Get user statistics
- `isUsernameAvailable(username)` - Check username availability

## Default Admin User

**Email**: admin@example.com  
**Password**: password  
**Role**: admin

## Security Features

1. **Password Hashing**: All passwords are hashed using bcryptjs with 10 salt rounds
2. **Input Validation**: Zod schemas validate all API inputs
3. **Session Management**: JWT tokens for stateless authentication
4. **Role-Based Access**: Middleware checks user roles for protected routes
5. **Error Handling**: Proper error responses without exposing sensitive data

## Database Migration

### Current State
- Uses PostgreSQL database with Prisma ORM (`PrismaUserService` class)
- Data persists in PostgreSQL database
- Production-ready with proper data persistence

### Database Schema

The Prisma schema defines the User model:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  password  String
  role      String   @default("user")
  profilePicture String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}
```

### Database Configuration

1. **Current Setup**: SQLite (file-based, perfect for development)
2. **Production Migration**: 
   - Update `DATABASE_URL` in `.env`
   - Change provider in `schema.prisma`
   - Run `npx prisma migrate deploy`

**PostgreSQL Example**:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

**MySQL Example**:
```env
DATABASE_URL="mysql://user:password@localhost:3306/mydb"
```

**Environment Variables**:
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3001"
```

## Testing

1. **Start the application**: `npm run dev`
2. **Database setup**: Automatically created with migrations
3. **Default admin**: admin@example.com / password (seeded)
4. **Test registration**: POST to `/api/auth/register`
5. **Test login**: Use the seeded admin credentials
6. **Test profile updates**: Access `/api/profile`
7. **Test admin access**: Access `/api/admin`
8. **Database inspection**: Use `npx prisma studio`

The application includes:
- User registration with validation
- Login with hashed password verification
- Profile management
- Admin dashboard access
- Role-based route protection

## Prisma Commands

- **Generate client**: `npx prisma generate`
- **Run migrations**: `npx prisma migrate dev`
- **Reset database**: `npx prisma migrate reset`
- **Seed database**: `npm run db:seed`
- **Database studio**: `npx prisma studio`
- **Deploy migrations**: `npx prisma migrate deploy`

## Next Steps for Production

1. **Database Migration**: Switch to PostgreSQL/MySQL for production
2. **Email Verification**: Add email verification for new registrations
3. **Password Reset**: Implement forgot password functionality
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Logging**: Implement proper logging for security events
6. **HTTPS**: Ensure all production traffic uses HTTPS
7. **Environment Security**: Use proper environment variable management

## File Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── register/route.ts     # User registration
│   │   │   └── change-username/route.ts # Username updates
│   │   ├── profile/
│   │   │   ├── route.ts              # Profile management
│   │   │   └── picture/route.ts      # Profile picture upload
│   │   └── admin/route.ts            # Admin dashboard
│   └── route.ts                      # Root API route
├── lib/
│   ├── prisma.ts                     # Prisma client instance
│   ├── prisma-user-service.ts        # Prisma user operations
│   ├── user-storage.ts               # User storage service
│   └── email/service.ts              # Email service (placeholder)
├── prisma/
│   ├── schema.prisma                 # Database schema
│   ├── seed.ts                       # Database seeding
│   └── migrations/                   # Database migrations
├── auth.config.ts                    # NextAuth configuration
├── auth.ts                           # NextAuth setup
├── middleware.ts                     # Route protection
└── types/next-auth.d.ts              # TypeScript definitions
```

This system provides a solid foundation for a production-ready authentication system while maintaining flexibility for your specific database and deployment requirements.