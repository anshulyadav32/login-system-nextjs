import { NextRequest, NextResponse } from 'next/server'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const rpName = 'Next.js Auth App'
const rpID = process.env.NODE_ENV === 'production' ? process.env.VERCEL_URL || 'localhost' : 'localhost'
const origin = process.env.NODE_ENV === 'production' 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3001'

// Schema for registration initiation
const initiateRegistrationSchema = z.object({
  username: z.string().min(1, 'Username is required')
})

// Schema for registration verification
const verifyRegistrationSchema = z.object({
  username: z.string().min(1, 'Username is required'),
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

// POST /api/auth/passkey/register - Initiate passkey registration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username } = initiateRegistrationSchema.parse(body)

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
      include: { webauthnCredentials: true }
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found. Please register first.' },
        { status: 404 }
      )
    }

    // Get existing credentials for this user
    const existingCredentials = existingUser.webauthnCredentials.map(cred => ({
      id: cred.credentialID,
      type: 'public-key' as const,
      transports: cred.transports ? JSON.parse(cred.transports) : undefined
    }))

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: existingUser.id,
      userName: existingUser.username,
      userDisplayName: existingUser.username,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map(cred => ({
        ...cred,
        id: Buffer.from(cred.id, 'base64url')
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform'
      }
    })

    // Store challenge in session or temporary storage
    // For simplicity, we'll store it in the response and expect it back
    return NextResponse.json({
      options,
      challenge: options.challenge
    })

  } catch (error) {
    console.error('Passkey registration initiation error:', error)
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

// PUT /api/auth/passkey/register - Verify passkey registration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, credential } = verifyRegistrationSchema.parse(body)

    // Get user
    const user = await prisma.user.findUnique({
      where: { username }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // For demo purposes, we'll use a simple challenge verification
    // In production, you should store challenges securely (Redis, database, etc.)
    const expectedChallenge = request.headers.get('x-challenge')
    
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Challenge not provided' },
        { status: 400 }
      )
    }

    // Verify the registration response
    const verification = await verifyRegistrationResponse({
      response: {
        ...credential,
        clientExtensionResults: {},
        response: {
          ...credential.response,
          transports: credential.response.transports as AuthenticatorTransportFuture[] | undefined
        }
      },
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    })

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Passkey registration verification failed' },
        { status: 400 }
      )
    }

    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    // Save the credential to database
    await prisma.webAuthnCredential.create({
      data: {
        credentialID: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey),
        counter,
        credentialDeviceType,
        credentialBackedUp,
        transports: credential.response.transports ? JSON.stringify(credential.response.transports) : null,
        userId: user.id
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Passkey registered successfully'
    })

  } catch (error) {
    console.error('Passkey registration verification error:', error)
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