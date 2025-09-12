import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaUserService } from '@/lib/prisma-user-service'

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user from storage to check role
    const user = await PrismaUserService.findById(session.user.id)
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    // Get admin dashboard data
    const stats = await PrismaUserService.getUserStats()
    const dashboardData = {
      totalUsers: stats.totalUsers,
      totalAdmins: (stats.usersByRole.admin || 0) + (stats.usersByRole.super_admin || 0),
      usersByRole: stats.usersByRole,
      recentActivity: [
        { id: 1, action: 'User registered', timestamp: new Date().toISOString() },
        { id: 2, action: 'Admin login', timestamp: new Date().toISOString() }
      ]
    }
    
    return NextResponse.json({
      message: 'Admin access granted',
      data: dashboardData
    })
  } catch (error) {
    console.error('Admin route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
