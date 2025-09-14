const fetch = require('node-fetch');

async function testRefresh() {
  try {
    // First login to get tokens
    const loginResponse = await fetch('http://localhost:3001/api/auth/secure-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
        rememberMe: true, // This should generate a refresh token
        deviceInfo: {
          userAgent: 'Test Agent',
          platform: 'Test Platform'
        }
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login Status:', loginResponse.status);
    
    if (loginResponse.status === 200 && loginData.data.tokens.refreshToken) {
      const refreshToken = loginData.data.tokens.refreshToken;
      console.log('Refresh Token obtained:', refreshToken.substring(0, 20) + '...');
      
      // Now test refresh
      const refreshResponse = await fetch('http://localhost:3001/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: refreshToken
        })
      });

      console.log('Refresh Status:', refreshResponse.status);
      const refreshData = await refreshResponse.json();
      console.log('Refresh Response:', JSON.stringify(refreshData, null, 2));
    } else {
      console.log('Login failed or no refresh token, cannot test refresh');
      console.log('Login response:', JSON.stringify(loginData, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRefresh();