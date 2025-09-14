import { prisma } from '../lib/prisma'
import * as bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'

export type UserWithoutPassword = Omit<User, 'password'>

export class PrismaUserService {
  static async findById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id }
    })
  }

  static async findByEmail(email: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { email }
    })
  }

  static async findByUsername(username: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { username }
    })
  }

  static async createUser(userData: {
    email: string
    username: string
    password: string
    role?: string
  }): Promise<UserWithoutPassword> {
    const hashedPassword = await bcrypt.hash(userData.password, 12)
    
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        role: userData.role || 'user'
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  static async updateUser(id: string, updates: Partial<{
    email: string
    username: string
    password: string
    role: string
    profilePicture: string
  }>): Promise<UserWithoutPassword | null> {
    const updateData: Partial<User> = { ...updates }
    
    // Hash password if it's being updated
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 12)
    }

    try {
      const user = await prisma.user.update({
        where: { id },
        data: updateData
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...userWithoutPassword } = user
      return userWithoutPassword
    } catch {
      return null
    }
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password) {
      return false
    }
    const result = await bcrypt.compare(password, user.password)
    return result
  }

  static async isEmailAvailable(email: string): Promise<boolean> {
    const user = await this.findByEmail(email)
    return user === null
  }

  static async isUsernameAvailable(username: string): Promise<boolean> {
    const user = await this.findByUsername(username)
    return user === null
  }

  static async getUserStats(): Promise<{
    totalUsers: number
    adminUsers: number
    regularUsers: number
  }> {
    const [totalUsers, adminUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } })
    ])

    return {
      totalUsers,
      adminUsers,
      regularUsers: totalUsers - adminUsers
    }
  }

  static async getAllUsers(): Promise<UserWithoutPassword[]> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        profilePicture: true,
        lastLoginAt: true,
        loginCount: true,
        isLocked: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return users
  }
}