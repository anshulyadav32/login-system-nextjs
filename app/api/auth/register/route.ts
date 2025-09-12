import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaUserService } from '@/lib/prisma-user-service'

// Validation schema for user registration
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  username: z.string().min(1, 'Username is required'),
  role: z.enum(['user', 'admin', 'super_admin']).optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = registerSchema.parse(body)

    // Create new user
    const newUser = await PrismaUserService.createUser({
      email: validatedData.email,
      password: validatedData.password,
      username: validatedData.username,
      role: validatedData.role
    })

    return NextResponse.json({
      message: 'User registered successfully',
      user: newUser
    }, { status: 201 })
  } catch (error) {
    console.error('Registration error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    if (error instanceof Error && error.message === 'User already exists') {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
