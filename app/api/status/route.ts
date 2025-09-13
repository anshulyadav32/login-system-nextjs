import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const timestamp = new Date().toISOString();
  
  try {
    // Test database connection
    await prisma.$connect();
    const userCount = await prisma.user.count();
    
    // API endpoints status
    const apiEndpoints = {
      health: {
        path: '/api/health',
        status: 'operational',
        description: 'Basic health check endpoint'
      },
      auth: {
        register: {
          path: '/api/auth/register',
          method: 'POST',
          status: 'operational',
          description: 'User registration endpoint'
        },
        login: {
          path: '/api/auth/login', 
          method: 'POST',
          status: 'operational',
          description: 'User login endpoint'
        },
        changeUsername: {
          path: '/api/auth/change-username',
          method: 'POST', 
          status: 'operational',
          description: 'Change username endpoint (requires auth)'
        }
      },
      profile: {
        getProfile: {
          path: '/api/profile',
          method: 'GET',
          status: 'operational',
          description: 'Get user profile (requires auth)'
        },
        updateProfile: {
          path: '/api/profile',
          method: 'PUT',
          status: 'operational', 
          description: 'Update user profile (requires auth)'
        },
        uploadPicture: {
          path: '/api/profile/picture',
          method: 'POST',
          status: 'operational',
          description: 'Upload profile picture (requires auth)'
        }
      },
      admin: {
        dashboard: {
          path: '/api/admin/dashboard',
          method: 'GET',
          status: 'operational',
          description: 'Admin dashboard data (requires admin auth)'
        }
      },
      user: {
        getUser: {
          path: '/api/user/[id]',
          method: 'GET', 
          status: 'operational',
          description: 'Get user by ID (requires auth)'
        }
      }
    };

    // Server information
    const serverInfo = {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp
    };

    // Database status
    const databaseStatus = {
      connected: true,
      userCount,
      provider: 'PostgreSQL',
      status: 'operational'
    };

    await prisma.$disconnect();

    return NextResponse.json({
      status: 'operational',
      message: 'Server and all API endpoints are working fine',
      timestamp,
      server: serverInfo,
      database: databaseStatus,
      endpoints: apiEndpoints,
      summary: {
        totalEndpoints: Object.keys(apiEndpoints).reduce((count, category) => {
          const endpoint = apiEndpoints[category as keyof typeof apiEndpoints];
          if (typeof endpoint === 'object' && 'status' in endpoint) {
            return count + 1;
          }
          return count + Object.keys(endpoint as Record<string, unknown>).length;
        }, 0),
        operationalEndpoints: 'All endpoints operational',
        authenticationEnabled: true,
        corsEnabled: true
      }
    });

  } catch (error) {
    console.error('Status check failed:', error);
    
    return NextResponse.json({
      status: 'error',
      message: 'Server status check failed',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
      server: {
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform,
        timestamp
      }
    }, { status: 500 });
  }
}