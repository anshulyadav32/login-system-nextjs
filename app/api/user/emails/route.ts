import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/service';
import crypto from 'crypto';

// GET - List all user emails
export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' },
      include: {
        emails: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      primaryEmail: user.email,
      additionalEmails: user.emails
    });
  } catch (error) {
    console.error('Get emails error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add new email address
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if email is already used by any user
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email is already in use' },
        { status: 400 }
      );
    }

    // Check if email is already added as additional email
    const existingEmail = await prisma.userEmail.findUnique({
      where: { email }
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Email is already added to an account' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Add email to user
    const userEmail = await prisma.userEmail.create({
      data: {
        userId: user.id,
        email,
        verified: false,
        isPrimary: false
      }
    });

    // Generate verification token
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
          <p>You've added this email address to your account.</p>
          <p>Click the link below to verify this email:</p>
          <a href="${verificationUrl}" style="background-color: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't add this email, please ignore this message.</p>
        </div>
      `
    });

    return NextResponse.json({
      message: 'Email added successfully. Please check your email to verify.',
      email: userEmail
    });
  } catch (error) {
    console.error('Add email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}