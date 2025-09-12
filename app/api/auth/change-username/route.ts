import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { z } from 'zod'
import { PrismaUserService } from '@/lib/prisma-user-service'

const changeUsernameSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long')
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validatedData = changeUsernameSchema.parse(body)

    // Check if username is already taken
    const existingUser = await PrismaUserService.findByUsername(validatedData.username)
    if (existingUser && existingUser.id !== session.user.id) {
      return NextResponse.json(
        { error: 'Username is already taken' },
        { status: 409 }
      )
    }

    // Update username in storage
    const updatedUser = await PrismaUserService.updateUser(session.user.id, {
      username: validatedData.username
    })

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Failed to update username' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Username updated successfully',
      username: validatedData.username
    })
  } catch (error) {
    console.error('Change username error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}