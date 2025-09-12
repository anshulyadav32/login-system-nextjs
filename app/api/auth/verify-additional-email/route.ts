import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/service';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Verification token is required' },
        { status: 400 }
      );
    }

    // Find verification token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token }
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: 'Invalid verification token' },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (verificationToken.expires < new Date()) {
      // Delete expired token
      await prisma.emailVerificationToken.delete({
        where: { token }
      });
      
      return NextResponse.json(
        { error: 'Verification token has expired' },
        { status: 400 }
      );
    }

    // Find the user email to verify
    const userEmail = await prisma.userEmail.findUnique({
      where: { email: verificationToken.email }
    });

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 400 }
      );
    }

    // Update email verification status
    await prisma.userEmail.update({
      where: { email: verificationToken.email },
      data: { verified: true }
    });

    // Delete used token
    await prisma.emailVerificationToken.delete({
      where: { token }
    });

    return NextResponse.json({
      message: 'Additional email verified successfully',
      success: true
    });
  } catch (error) {
    console.error('Additional email verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Resend verification email for additional email
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find the user email
    const userEmail = await prisma.userEmail.findUnique({
      where: { email }
    });

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    if (userEmail.verified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      );
    }

    // Delete any existing verification tokens for this email
    await prisma.emailVerificationToken.deleteMany({
      where: { email }
    });

    // Generate new verification token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerificationToken.create({
      data: {
        email,
        token,
        expires
      }
    });

    // Send verification email
    const verificationUrl = `${process.env.NEXTAUTH_URL}/auth/verify-additional-email?token=${token}`;
    
    await sendEmail({
      to: email,
      subject: 'Verify Additional Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Additional Email Address</h2>
          <p>You've requested to verify this additional email address.</p>
          <p>Click the link below to verify this email:</p>
          <a href="${verificationUrl}" style="background-color: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this, please ignore this message.</p>
        </div>
      `
    });

    return NextResponse.json({
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('Resend verification email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}