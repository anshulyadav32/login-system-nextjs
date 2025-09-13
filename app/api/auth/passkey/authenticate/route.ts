import { NextRequest, NextResponse } from 'next/server'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticatorTransportFuture, PublicKeyCredentialDescriptorFuture } from '@simplewebauthn/types'
import { prisma } from '@/lib/prisma'
import { SignJWT } from 'jose'
import { z } from 'zod'

const rpID = process.env.NODE_ENV === 'production' ? process.env.VERCEL_URL || 'localhost' : 'localhost'
const origin = process.env.NODE_ENV === 'production' 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3001'

// Schema for authentication initiation
const initiateAuthenticationSchema = z.object({
  username: z.string().min(1, 'Username is required').optional()
})

// Schema for authentication verification
const verifyAuthenticationSchema = z.object({
  username: z.string().min(1, 'Username is required').optional(),
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

// POST /api/auth/passkey/authenticate - Initiate passkey authentication
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username } = initiateAuthenticationSchema.parse(body)

    let allowCredentials: PublicKeyCredentialDescriptorFuture[] = []

    if (username) {
      // Username provided - get specific user's credentials
      const user = await prisma.user.findUnique({
        where: { username },
        include: { webauthnCredentials: true }
      })

      if (!user || user.webauthnCredentials.length === 0) {
        return NextResponse.json(
          { error: 'No passkeys found for this user' },
          { status: 404 }
        )
      }

allowCredentials = user.webauthnCredentials.map(cred => ({
        id: Buffer.from(cred.credentialID, 'base64url'),
        type: 'public-key' as const,
        transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransportFuture[] : undefined
      }))
    }
    // If no username provided, allow any registered credential (discoverable credentials)

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred'
    })

    return NextResponse.json({
      options,
      challenge: options.challenge
    })

  } catch (error) {
    console.error('Passkey authentication initiation error:', error)
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

// PUT /api/auth/passkey/authenticate - Verify passkey authentication
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, credential: rawCredential } = verifyAuthenticationSchema.parse(body)
    
    // Ensure credential has required properties for SimpleWebAuthn
    const credential = {
      ...rawCredential,
      clientExtensionResults: {}
    }

    // Find the credential in database
    const dbCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialID: credential.id },
      include: { user: true }
    })

    if (!dbCredential) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      )
    }

    // If username was provided, verify it matches
    if (username && dbCredential.user.username !== username) {
      return NextResponse.json(
        { error: 'Credential does not belong to this user' },
        { status: 403 }
      )
    }

    const expectedChallenge = request.headers.get('x-challenge')
    
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Challenge not provided' },
        { status: 400 }
      )
    }

    // Verify the authentication response
    const verification = await verifyAuthenticationResponse({
      response: {
        ...credential,
        clientExtensionResults: {}
      },
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(dbCredential.credentialID, 'base64url'),
        credentialPublicKey: dbCredential.credentialPublicKey,
        counter: dbCredential.counter,
        transports: dbCredential.transports ? JSON.parse(dbCredential.transports) : undefined
      }
    })

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Passkey authentication verification failed' },
        { status: 400 }
      )
    }

    // Update counter
    await prisma.webAuthnCredential.update({
      where: { id: dbCredential.id },
      data: { counter: verification.authenticationInfo.newCounter }
    })

    // Generate JWT token
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'fallback-secret')
    const token = await new SignJWT({
      sub: dbCredential.user.id,
      username: dbCredential.user.username,
      email: dbCredential.user.email,
      role: dbCredential.user.role,
      authMethod: 'passkey'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret)

    // Set HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      message: 'Authentication successful',
      user: {
        id: dbCredential.user.id,
        username: dbCredential.user.username,
        email: dbCredential.user.email,
        role: dbCredential.user.role
      }
    })

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 // 24 hours
    })

    return response

  } catch (error) {
    console.error('Passkey authentication verification error:', error)
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