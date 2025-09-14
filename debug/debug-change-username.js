const fetch = require('node-fetch');

async function testChangeUsername() {
  try {
    // First login to get an access token
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
      
      // Now test change username
      const changeUsernameResponse = await fetch('http://localhost:3001/api/auth/change-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          newUsername: 'testuser_updated'
        })
      });

      console.log('Change Username Status:', changeUsernameResponse.status);
      const changeUsernameData = await changeUsernameResponse.json();
      console.log('Change Username Response:', JSON.stringify(changeUsernameData, null, 2));
    } else {
      console.log('Login failed, cannot test change username');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testChangeUsername();