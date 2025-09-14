const fetch = require('node-fetch');

async function testLogout() {
  try {
    // First login to get a session token
    const loginResponse = await fetch('http://localhost:3001/api/auth/secure-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123!',
        rememberMe: false,
        deviceInfo: {
          userAgent: 'Test Agent',
          platform: 'Test Platform'
        }
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login Status:', loginResponse.status);
    
    if (loginResponse.status === 200 && loginData.data.tokens.accessToken) {
      const accessToken = loginData.data.tokens.accessToken;
      console.log('Access Token obtained:', accessToken.substring(0, 20) + '...');
      
      // Now test logout
      const logoutResponse = await fetch('http://localhost:3001/api/auth/secure-logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('Logout Status:', logoutResponse.status);
      const logoutData = await logoutResponse.json();
      console.log('Logout Response:', JSON.stringify(logoutData, null, 2));
    } else {
      console.log('Login failed, cannot test logout');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogout();