import { NextResponse } from 'next/server'

export async function GET() {
  // Return JSON response for API compatibility
  return NextResponse.json({
    message: 'Next.js Backend API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      status: '/api/status',
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login'
      },
      profile: '/api/profile',
      admin: '/api/admin/dashboard'
    }
  })
}
