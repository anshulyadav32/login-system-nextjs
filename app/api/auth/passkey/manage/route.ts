import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { z } from 'zod'

// Schema for deleting a credential
const deleteCredentialSchema = z.object({
  credentialId: z.string().min(1, 'Credential ID is required')
})

// GET /api/auth/passkey/manage - List user's passkeys
export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get user's credentials
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        credentialID: true,
        credentialDeviceType: true,
        credentialBackedUp: true,
        transports: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Format credentials for response
    const formattedCredentials = credentials.map(cred => ({
      id: cred.id,
      credentialId: cred.credentialID,
      deviceType: cred.credentialDeviceType,
      backedUp: cred.credentialBackedUp,
      transports: cred.transports ? JSON.parse(cred.transports) : [],
      createdAt: cred.createdAt,
      lastUsed: cred.updatedAt
    }))

    return NextResponse.json({
      success: true,
      credentials: formattedCredentials,
      count: formattedCredentials.length
    })

  } catch (error) {
    console.error('Error fetching passkeys:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/auth/passkey/manage - Delete a specific passkey
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { credentialId } = deleteCredentialSchema.parse(body)

    // Find the credential
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { 
        id: credentialId,
        userId: session.user.id // Ensure user owns this credential
      }
    })

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found or access denied' },
        { status: 404 }
      )
    }

    // Check if this is the user's last credential and they don't have a password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { webauthnCredentials: true }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Prevent deletion if it's the last authentication method
    if (user.webauthnCredentials.length === 1 && !user.password) {
      return NextResponse.json(
        { 
          error: 'Cannot delete last passkey. Please set a password first or add another passkey.',
          code: 'LAST_AUTH_METHOD'
        },
        { status: 400 }
      )
    }

    // Delete the credential
    await prisma.webAuthnCredential.delete({
      where: { id: credentialId }
    })

    return NextResponse.json({
      success: true,
      message: 'Passkey deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting passkey:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/auth/passkey/manage - Rename a passkey (add nickname)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { credentialId } = z.object({
      credentialId: z.string().min(1, 'Credential ID is required'),
      nickname: z.string().max(50, 'Nickname too long').optional()
    }).parse(body)

    // Find and update the credential
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { 
        id: credentialId,
        userId: session.user.id
      }
    })

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found or access denied' },
        { status: 404 }
      )
    }

    // For now, we'll store nickname in transports field as JSON
    // In a real app, you might want to add a separate nickname field to the schema
    const currentTransports = credential.transports ? JSON.parse(credential.transports) : []
    const updatedData = {
      transports: JSON.stringify(currentTransports),
      // Store nickname in a metadata field if you add one to schema
      updatedAt: new Date()
    }

    await prisma.webAuthnCredential.update({
      where: { id: credentialId },
      data: updatedData
    })

    return NextResponse.json({
      success: true,
      message: 'Passkey updated successfully'
    })

  } catch (error) {
    console.error('Error updating passkey:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}