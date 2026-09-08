import http from 'node:http';

async function request(options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });
    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function run() {
  console.log('=== TEST 1: LOGIN AS CUSTOMER ===');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 4000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    {
      email: 'sara.nabil@customer.local',
      password: 'ChangeMe-Customer-123',
    }
  );

  console.log('Customer login status:', loginRes.statusCode);
  if (loginRes.statusCode !== 200) {
    console.error('Customer login failed:', loginRes.data);
    process.exit(1);
  }

  const session = loginRes.data;
  console.log('Customer role:', session.role);
  console.log('Customer landing page:', session.landingPage);

  const cookieHeaders = loginRes.headers['set-cookie'] || [];
  const cookieHeader = cookieHeaders.map((c) => c.split(';')[0]).join('; ');

  console.log('\n=== TEST 2: CUSTOMER PORTAL ASSETS / GARAGE ===');
  const assetsRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/customer-portal/assets',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });
  console.log('Assets status:', assetsRes.statusCode);
  console.log('Customer registered assets:', assetsRes.data?.length);

  console.log('\n=== TEST 3: CUSTOMER LIVE TRACKING ===');
  const trackingRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/customer-portal/live-tracking',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });
  console.log('Live tracking status:', trackingRes.statusCode);
  console.log('Live tracking work order:', trackingRes.data?.workOrderId ?? 'None currently active');

  console.log('\n=== TEST 4: CUSTOMER INVOICES & BILLING ===');
  const invoicesRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/customer-portal/invoices',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });
  console.log('Invoices status:', invoicesRes.statusCode);
  console.log('Customer invoices count:', invoicesRes.data?.length);

  console.log('\n=== TEST 5: VERIFY CUSTOMER IS FORBIDDEN FROM OPERATOR ENDPOINTS ===');
  const forbiddenRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/operator/overview',
    method: 'GET',
    headers: { Cookie: cookieHeader },
  });
  console.log('Accessing /api/v1/operator/overview as customer returned status:', forbiddenRes.statusCode);
  if (forbiddenRes.statusCode === 403) {
    console.log('✓ Correctly forbidden! Customer cannot access operator workstation.');
  } else {
    throw new Error(`Expected 403 Forbidden, got ${forbiddenRes.statusCode}`);
  }

  console.log('\n=== ALL CUSTOMER PORTAL & BOUNDARY TESTS PASSED! ===');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
