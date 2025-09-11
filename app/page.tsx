'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'

export default function HomePage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Next.js Auth App
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          A secure authentication system with Next.js, NextAuth, and PostgreSQL
        </p>
      </div>

      {/* Authentication Status */}
      <div className="max-w-2xl mx-auto">
        {session ? (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Welcome back, {session.user?.name || session.user?.email}!</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">Account Info</h3>
                  <p className="text-sm text-gray-600">Email: {session.user?.email}</p>
                  <p className="text-sm text-gray-600">Role: {session.user?.role || 'user'}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">Quick Actions</h3>
                  <div className="space-y-2">
                    <Link href="/dashboard" className="block text-blue-600 hover:text-blue-800 text-sm">
                      → Go to Dashboard
                    </Link>
                    {session.user?.role === 'admin' && (
                      <Link href="/admin" className="block text-purple-600 hover:text-purple-800 text-sm">
                        → Admin Panel
                      </Link>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => signOut()}
                  className="btn-secondary"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Get Started</h2>
            </div>
            <div className="text-center space-y-6">
              <p className="text-gray-600">
                Sign in to access your dashboard and explore the features of this authentication system.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/signin" className="btn-primary">
                  Sign In
                </Link>
                <Link href="/auth/signup" className="btn-secondary">
                  Create Account
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
          Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="card text-center">
            <div className="text-blue-600 text-3xl mb-4">🔐</div>
            <h3 className="font-semibold text-gray-900 mb-2">Secure Authentication</h3>
            <p className="text-gray-600 text-sm">
              Multiple sign-in options including email/password and OAuth providers
            </p>
          </div>
          <div className="card text-center">
            <div className="text-green-600 text-3xl mb-4">👤</div>
            <h3 className="font-semibold text-gray-900 mb-2">User Management</h3>
            <p className="text-gray-600 text-sm">
              Role-based access control with user and admin roles
            </p>
          </div>
          <div className="card text-center">
            <div className="text-purple-600 text-3xl mb-4">📧</div>
            <h3 className="font-semibold text-gray-900 mb-2">Email Verification</h3>
            <p className="text-gray-600 text-sm">
              Email verification and password reset functionality
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}