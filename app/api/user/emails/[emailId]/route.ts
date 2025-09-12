import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// DELETE - Remove email address
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { emailId } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find the email to delete
    const userEmail = await prisma.userEmail.findFirst({
      where: {
        id: emailId,
        userId: user.id
      }
    });

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    // Don't allow deleting primary email
    if (userEmail.isPrimary) {
      return NextResponse.json(
        { error: 'Cannot delete primary email address' },
        { status: 400 }
      );
    }

    // Delete the email
    await prisma.userEmail.delete({
      where: { id: emailId }
    });

    // Clean up any verification tokens for this email
    await prisma.emailVerificationToken.deleteMany({
      where: { email: userEmail.email }
    });

    return NextResponse.json({
      message: 'Email removed successfully'
    });
  } catch (error) {
    console.error('Delete email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update email (set as primary)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { emailId } = await params;
    const { isPrimary } = await request.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user?.email || '' }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find the email to update
    const userEmail = await prisma.userEmail.findFirst({
      where: {
        id: emailId,
        userId: user.id
      }
    });

    if (!userEmail) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    // Only allow setting as primary if email is verified
    if (isPrimary && !userEmail.verified) {
      return NextResponse.json(
        { error: 'Email must be verified before setting as primary' },
        { status: 400 }
      );
    }

    if (isPrimary) {
      // Use transaction to ensure consistency
      await prisma.$transaction(async (tx) => {
        // Remove primary status from all other emails
        await tx.userEmail.updateMany({
          where: {
            userId: user.id,
            isPrimary: true
          },
          data: { isPrimary: false }
        });

        // Set this email as primary
        await tx.userEmail.update({
          where: { id: emailId },
          data: { isPrimary: true }
        });

        // Update user's primary email
        await tx.user.update({
          where: { id: user.id },
          data: { email: userEmail.email }
        });
      });

      return NextResponse.json({
        message: 'Primary email updated successfully'
      });
    }

    // If not setting as primary, just update the email
    const updatedEmail = await prisma.userEmail.update({
      where: { id: emailId },
      data: { isPrimary }
    });

    return NextResponse.json({
      message: 'Email updated successfully',
      email: updatedEmail
    });
  } catch (error) {
    console.error('Update email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}