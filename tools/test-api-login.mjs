import http from 'node:http';

const payload = JSON.stringify({
  email: 'platform-admin@mop.local',
  password: 'ChangeMe-Platform-123'
});

const req = http.request('http://localhost:4000/api/v1/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body:', data);
  });
});

req.on('error', console.error);
req.write(payload);
req.end();
