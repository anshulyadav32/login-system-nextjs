import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    message: 'Next.js Backend API Server',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      profile: '/api/profile',
      health: '/api/health'
    },
    status: 'running'
  })
}
