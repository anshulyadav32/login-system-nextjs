import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET() {
  try {
    // Read the server status HTML file
    const filePath = join(process.cwd(), 'public', 'server-status.html')
    const htmlContent = await readFile(filePath, 'utf8')
    
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
  } catch (error) {
    // Fallback to JSON response if HTML file is not found
    return NextResponse.json({
      error: 'Server status page not found',
      message: 'Next.js Backend API Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      status: 'running',
      environment: process.env.NODE_ENV || 'development'
    })
  }
}
