import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaUserService } from '@/lib/prisma-user-service'

import { z } from 'zod'

// Validation schema for profile picture upload
const profilePictureSchema = z.object({
  image: z.string().min(1, 'Image data is required'),
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
    const validatedData = profilePictureSchema.parse(body)

    // Validate base64 image format
    const base64Pattern = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/
    if (!base64Pattern.test(validatedData.image)) {
      return NextResponse.json(
        { error: 'Invalid image format. Please upload a valid image file.' },
        { status: 400 }
      )
    }

    // Check file size (base64 encoded, so roughly 4/3 of actual size)
    const base64Data = validatedData.image.split(',')[1]
    const sizeInBytes = (base64Data.length * 3) / 4
    const maxSizeInBytes = 5 * 1024 * 1024 // 5MB
    
    if (sizeInBytes > maxSizeInBytes) {
      return NextResponse.json(
        { error: 'Image size too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    // Update user's profile picture
    const updatedUser = await PrismaUserService.updateUser(session.user.id, {
      profilePicture: validatedData.image,
    })

    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Failed to remove profile picture' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Profile picture updated successfully',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Profile picture upload error:', error)
    
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Remove profile picture from storage
    const updatedUser = await PrismaUserService.updateUser(session.user.id, { profilePicture: null })
    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Failed to remove profile picture' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Profile picture removed successfully',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Profile picture removal error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}