import nodemailer from 'nodemailer'

async function createTestAccount() {
  try {
    console.log('🔧 Creating Ethereal Email test account...')
    
    const testAccount = await nodemailer.createTestAccount()
    
    console.log('\n✅ Test email account created!')
    console.log('─'.repeat(50))
    console.log(`EMAIL_HOST="smtp.ethereal.email"`)
    console.log(`EMAIL_PORT="587"`)
    console.log(`EMAIL_USER="${testAccount.user}"`)
    console.log(`EMAIL_PASSWORD="${testAccount.pass}"`)
    console.log('─'.repeat(50))
    console.log('\n📋 Add these to your .env file to test email functionality')
    console.log('🌐 Preview emails at: https://ethereal.email/messages')
    console.log('\n💡 Note: These are test credentials - emails won\'t actually be delivered')
    
  } catch (error) {
    console.error('❌ Failed to create test account:', error)
  }
}

createTestAccount()
