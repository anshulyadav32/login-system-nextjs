// Mock for jose library to avoid ES module issues in Jest
module.exports = {
  SignJWT: class SignJWT {
    constructor(payload) {
      this.payload = payload;
      // Store payload globally for jwtVerify to access
      global.__mockJWTPayload = payload;
    }
    setProtectedHeader(header) {
      this.header = header;
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime(exp) {
      this.exp = exp;
      return this;
    }
    setIssuer(issuer) {
      this.issuer = issuer;
      return this;
    }
    setAudience(audience) {
      this.audience = audience;
      return this;
    }
    setJti(jti) {
      this.jti = jti;
      return this;
    }
    async sign(secret) {
      return 'mock.jwt.token';
    }
  },
  jwtVerify: jest.fn().mockImplementation((token, secret) => {
    if (token === 'mock.jwt.token') {
      // Get the stored payload from the SignJWT mock
      const storedPayload = global.__mockJWTPayload || {
        sub: 'test-user-id',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      };
      
      return Promise.resolve({
        payload: {
          ...storedPayload,
          tokenType: 'access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        protectedHeader: {
          alg: 'HS256'
        }
      });
    }
    // For invalid tokens, throw an error
    const error = new Error('Invalid token');
    error.name = 'JWTInvalid';
    throw error;
  }),
  errors: {
    JWTExpired: class JWTExpired extends Error {
      constructor(message) {
        super(message);
        this.name = 'JWTExpired';
      }
    },
    JWTInvalid: class JWTInvalid extends Error {
      constructor(message) {
        super(message);
        this.name = 'JWTInvalid';
      }
    }
  }
};