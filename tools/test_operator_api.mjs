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
  console.log('=== TEST 1: LOGIN AS OPERATOR ===');
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
      email: 'operator@apex-motors.local',
      password: 'ChangeMe-Operator-123',
    }
  );

  console.log('Login status:', loginRes.statusCode);
  if (loginRes.statusCode !== 200) {
    console.error('Login failed:', loginRes.data);
    process.exit(1);
  }

  const session = loginRes.data;
  console.log('Session user role:', session.role);
  console.log('Landing page:', session.landingPage);
  if (session.role !== 'OPERATOR') {
    throw new Error(`Expected role OPERATOR, got ${session.role}`);
  }
  if (session.landingPage !== 'operator-home') {
    throw new Error(`Expected landingPage operator-home, got ${session.landingPage}`);
  }

  // Extract cookies
  const cookieHeaders = loginRes.headers['set-cookie'] || [];
  const cookieHeader = cookieHeaders.map((c) => c.split(';')[0]).join('; ');
  console.log('Extracted cookie header length:', cookieHeader.length);

  console.log('\n=== TEST 2: OPERATOR OVERVIEW (METRICS & RECEPTION FLOOR) ===');
  const overviewRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/operator/overview',
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
    },
  });

  console.log('Overview status:', overviewRes.statusCode);
  if (overviewRes.statusCode !== 200) {
    console.error('Overview failed:', overviewRes.data);
    process.exit(1);
  }
  const overview = overviewRes.data;
  console.log('Operator counts:', overview.counts);
  console.log('Vehicles available on reception floor:', overview.vehicles?.length);
  if (overview.vehicles && overview.vehicles.length > 0) {
    console.log('Sample vehicle:', {
      id: overview.vehicles[0].id,
      plateNumber: overview.vehicles[0].plateNumber,
      customerName: overview.vehicles[0].customerName,
      activeWorkOrderId: overview.vehicles[0].activeWorkOrderId,
    });
  }

  console.log('\n=== TEST 3: OPERATOR VEHICLE SEARCH (OMNIBAR) ===');
  const searchRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/operator/search?q=apex',
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
    },
  });
  console.log('Search status:', searchRes.statusCode);
  console.log('Search results count:', searchRes.data?.length);

  console.log('\n=== TEST 4: PRE-SELECTED LOCKED VEHICLE INTAKE ===');
  if (overview.vehicles && overview.vehicles.length > 0) {
    const targetVehicle = overview.vehicles[0];
    console.log(`Submitting intake for pre-selected vehicle ${targetVehicle.plateNumber} (ID: ${targetVehicle.id})`);
    const intakeRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/operator/intake',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      {
        assetId: targetVehicle.id,
        complaint: 'Customer reported grinding noise when braking and intermittent cabin air conditioning loss.',
        inspectionParts: ['brakes', 'ac'],
      }
    );
    console.log('Intake response status:', intakeRes.statusCode);
    console.log('Intake response data:', intakeRes.data);
    if (intakeRes.statusCode !== 201) {
      throw new Error(`Intake failed: ${JSON.stringify(intakeRes.data)}`);
    }
    console.log('✓ Successfully created work order ID:', intakeRes.data.workOrderId);
  }

  console.log('\n=== TEST 5: OPERATOR POS CATALOG & ORDER ===');
  const catalogRes = await request({
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/operator/pos/catalog?inStockOnly=true',
    method: 'GET',
    headers: {
      Cookie: cookieHeader,
    },
  });
  console.log('POS catalog status:', catalogRes.statusCode);
  const items = catalogRes.data?.items || [];
  console.log('Available catalog items:', items.length);

  if (items.length > 0) {
    const item = items[0];
    console.log(`Creating POS order for item: ${item.name} (${item.sku}) - Price: ${item.sellingPrice}`);
    const posRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/operator/pos/order',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
      },
      {
        lines: [
          {
            inventoryItemId: item.id,
            quantity: 1,
          },
        ],
      }
    );
    console.log('POS order status:', posRes.statusCode);
    console.log('POS order result:', posRes.data);
    if (posRes.statusCode !== 201) {
      throw new Error(`POS order failed: ${JSON.stringify(posRes.data)}`);
    }
  }

  console.log('\n=== ALL OPERATOR API TESTS PASSED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
