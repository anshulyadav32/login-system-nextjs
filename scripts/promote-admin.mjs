import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function promoteUser(email) {
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'admin' }
    })
    
    console.log('✅ User promoted to admin:', {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    })
  } catch (error) {
    console.error('❌ Error promoting user:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Get email from command line arguments
const email = process.argv[2]

if (!email) {
  console.log('Usage: npm run promote-admin <email>')
  console.log('Example: npm run promote-admin admin@test.com')
  process.exit(1)
}

promoteUser(email)
