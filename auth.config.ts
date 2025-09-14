import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaUserService } from '@/services/user.service'
import { prisma } from '@/lib/prisma'

export default {
  providers: [
    // Traditional email/password authentication
    Credentials({
      id: 'credentials',
      name: 'credentials',
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Find user by email
        const user = await PrismaUserService.findByEmail(credentials.email as string)
        if (!user) {
          return null
        }

        // Verify password
        const isValidPassword = await PrismaUserService.verifyPassword(
          user,
          credentials.password as string
        )

        if (!isValidPassword) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.username,
          role: user.role,
        }
      },
    }),
    // Passkey authentication
    Credentials({
      id: 'passkey',
      name: 'passkey',
      async authorize(credentials) {
        if (!credentials?.credentialId || !credentials?.userId) {
          return null
        }

        // Find user by credential ID
        const credential = await prisma.webAuthnCredential.findUnique({
          where: { credentialID: credentials.credentialId as string },
          include: { user: true }
        })

        if (!credential || credential.userId !== credentials.userId) {
          return null
        }

        // Update last used timestamp
        await prisma.webAuthnCredential.update({
          where: { id: credential.id },
          data: { updatedAt: new Date() }
        })

        return {
          id: credential.user.id,
          email: credential.user.email,
          name: credential.user.username,
          role: credential.user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role || 'user'
      }
      return token
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
        session.user.role = token.role as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
