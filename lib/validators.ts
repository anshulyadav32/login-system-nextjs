import { z } from 'zod'

// User validation schemas
export const userRegistrationSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must be less than 255 characters'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number')
})

export const userLoginSchema = z.object({
  identifier: z.string()
    .min(1, 'Email or username is required'),
  password: z.string()
    .min(1, 'Password is required')
})

export const profileUpdateSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  email: z.string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must be less than 255 characters')
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number')
    .optional(),
  confirmPassword: z.string().optional(),
  profilePicture: z.string()
    .url('Invalid profile picture URL')
    .optional()
}).refine((data) => {
  // If newPassword is provided, currentPassword must also be provided
  if (data.newPassword && !data.currentPassword) {
    return false
  }
  // If newPassword is provided, confirmPassword must match
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false
  }
  return true
}, {
  message: 'Password validation failed',
  path: ['newPassword']
})

// WebAuthn validation schemas
export const passkeyRegistrationInitSchema = z.object({
  email: z.string().email('Invalid email format')
})

export const passkeyRegistrationVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      transports: z.array(z.string()).optional()
    }),
    type: z.literal('public-key')
  })
})

export const passkeyAuthInitSchema = z.object({
  email: z.string().email('Invalid email format')
})

export const passkeyAuthVerifySchema = z.object({
  email: z.string().email('Invalid email format'),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional()
    }),
    type: z.literal('public-key')
  })
})

// Admin validation schemas
export const adminUserUpdateSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  isLocked: z.boolean().optional(),
  lockedUntil: z.date().optional()
})

// Generic validation helpers
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10)
})

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format')
})

// Export types
export type UserRegistration = z.infer<typeof userRegistrationSchema>
export type UserLogin = z.infer<typeof userLoginSchema>
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
export type PasskeyRegistrationInit = z.infer<typeof passkeyRegistrationInitSchema>
export type PasskeyRegistrationVerify = z.infer<typeof passkeyRegistrationVerifySchema>
export type PasskeyAuthInit = z.infer<typeof passkeyAuthInitSchema>
export type PasskeyAuthVerify = z.infer<typeof passkeyAuthVerifySchema>
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>
export type Pagination = z.infer<typeof paginationSchema>
export type IdParam = z.infer<typeof idParamSchema>