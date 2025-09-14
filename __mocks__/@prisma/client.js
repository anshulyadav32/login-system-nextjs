// Mock for Prisma Client to avoid database connections in Jest
const mockPrismaClient = {
  user: {
    findUnique: jest.fn().mockImplementation(({ where }) => {
      // Handle user queries
      if (where.id || where.email) {
        // Use the stored JWT payload to get the correct user data
        const payload = global.__mockJWTPayload || {};
        return Promise.resolve({
          id: payload.sub || where.id || 'test-user-id',
          email: payload.email || where.email || 'test@example.com',
          username: payload.username || 'testuser',
          role: payload.role || 'user',
          emailVerified: true,
          firstName: 'Test',
          lastName: 'User',
          isLocked: false,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      // Handle other queries (like tokenBlacklist) - return null
      return Promise.resolve(null);
    }),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn()
  },
  session: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn(),
    upsert: jest.fn()
  },
  refreshToken: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn(),
    upsert: jest.fn()
  },
  loginAttempt: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn(),
    upsert: jest.fn()
  },
  webauthnCredential: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn(),
    upsert: jest.fn()
  },
  tokenBlacklist: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn(),
    upsert: jest.fn()
  },
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn((callback) => callback(mockPrismaClient))
};

module.exports = {
  PrismaClient: jest.fn(() => mockPrismaClient),
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      constructor(message, code, clientVersion, meta) {
        super(message);
        this.name = 'PrismaClientKnownRequestError';
        this.code = code;
        this.clientVersion = clientVersion;
        this.meta = meta;
      }
    },
    PrismaClientUnknownRequestError: class PrismaClientUnknownRequestError extends Error {
      constructor(message, clientVersion) {
        super(message);
        this.name = 'PrismaClientUnknownRequestError';
        this.clientVersion = clientVersion;
      }
    }
  }
};