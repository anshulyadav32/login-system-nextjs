import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Next.js Auth App',
  description: 'A Next.js application with authentication',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm border-b">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex items-center">
                    <h1 className="text-xl font-semibold text-gray-900">
                      Next.js Auth App
                    </h1>
                  </div>
                  <div className="flex items-center space-x-4">
                    {session ? (
                      <>
                        <Link href="/dashboard" className="text-gray-700 hover:text-purple-600">
                          Dashboard
                        </Link>
                        {session.user?.role === 'admin' && (
                          <Link href="/admin" className="text-gray-700 hover:text-purple-600">
                            Admin
                          </Link>
                        )}
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-medium text-sm">
                              {session.user?.image ? (
                                <img
                                  src={session.user.image}
                                  alt={session.user.name || 'Profile'}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <span>
                                  {(session.user?.name || session.user?.email || 'U').charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => signOut()}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Sign Out
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Link href="/auth/signin" className="text-gray-700 hover:text-purple-600">
                          Sign In
                        </Link>
                        <Link href="/auth/signup" className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                          Sign Up
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </nav>
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}