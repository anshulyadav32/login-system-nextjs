import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import middlewareAuthConfig from './middleware.auth.config'

const { auth } = NextAuth(middlewareAuthConfig)

function corsMiddleware(request: Request) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'https://nuxtjs-frontend.vercel.app',
    'https://nextjs-backend-flame.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ]

  const origin = request.headers.get('origin')
  const response = NextResponse.next()

  // Handle CORS
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  )
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-Challenge'
  )

  return response
}

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  console.log("Protected route accessed:", nextUrl.pathname, "Logged in:", isLoggedIn)

  // Handle CORS for API routes
  if (nextUrl.pathname.startsWith('/api/')) {
    const corsResponse = corsMiddleware(req)
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return corsResponse
    }
    
    return corsResponse
  }

  if (!isLoggedIn && (nextUrl.pathname.startsWith('/dashboard') || nextUrl.pathname.startsWith('/admin'))) {
    return NextResponse.redirect(new URL('/signin', nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/((?!health|test|status|auth/passkey).)*"], // protect dashboard, admin routes and handle CORS for API routes, allow passkey endpoints
}
