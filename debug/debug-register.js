const { NextRequest } = require('next/server');

// Simple test to debug registration endpoint
async function testRegistration() {
  try {
    const response = await fetch('http://localhost:3001/api/auth/secure-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `test${Date.now()}@example.com`,
        username: `testuser${Date.now()}`,
        password: 'TestPassword123!',
        confirmPassword: 'TestPassword123!',
        acceptTerms: true
      })
    });

    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testRegistration();