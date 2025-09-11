import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  console.log("Protected route accessed:", nextUrl.pathname, "Logged in:", isLoggedIn)

  if (!isLoggedIn && (nextUrl.pathname.startsWith('/dashboard') || nextUrl.pathname.startsWith('/admin'))) {
    return NextResponse.redirect(new URL('/signin', nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"], // protect dashboard and admin routes
}
