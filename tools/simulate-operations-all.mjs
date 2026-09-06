import { BrowserDriver } from './browser-driver.mjs';

const BASE_URL = 'http://localhost:4200';

async function loginUser(driver, email, password) {
  console.log(`\nLogging in as ${email}...`);
  await driver.clearCookies();
  await driver.navigate(`${BASE_URL}/login`);
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', email);
  await driver.fill('input[type="password"], input[name="password"], #password', password);
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));
}

async function findWorkOrderByPlate(driver, plate) {
  return await driver.eval(`(async () => {
    try {
      const res = await fetch('/api/v1/branch-manager/work-orders?includeFinished=true&q=' + encodeURIComponent(${JSON.stringify(plate)}));
      const data = await res.json();
      for (const lane of (data.lanes || [])) {
        const match = lane.rows?.find(r => r.identifier?.includes(${JSON.stringify(plate)}));
        if (match) return match.id;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  })()`);
}

async function bookInVehicle(driver, intakeData) {
  console.log(`\n--- Booking In Vehicle: ${intakeData.plate} for ${intakeData.customerName} ---`);

  // First check if this vehicle already has an active or existing work order
  const existingId = await findWorkOrderByPlate(driver, intakeData.plate);
  if (existingId) {
    console.log(`Vehicle ${intakeData.plate} already has an existing work order: ${existingId}`);
    return existingId;
  }

  await driver.navigate(`${BASE_URL}/branch/intake`);
  await new Promise(r => setTimeout(r, 1500));

  // Reset if already in booked or restored draft state
  await driver.eval(`(() => {
    const bookAnother = Array.from(document.querySelectorAll('.booked button')).find(b => b.innerText.includes('Book in another') || b.innerText.includes('another'));
    if (bookAnother) bookAnother.click();
    const discard = Array.from(document.querySelectorAll('.restored button')).find(b => b.innerText.includes('Start fresh'));
    if (discard) discard.click();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // 1. Search for customer / vehicle
  await driver.eval(`(() => {
    const input = document.querySelector('.search-input');
    if (input) {
      input.value = ${JSON.stringify(intakeData.customerName)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 2. Select customer if found in results, else click "new customer"
  await driver.eval(`(() => {
    const matches = Array.from(document.querySelectorAll('.matches button.match'));
    const exactMatch = matches.find(m => m.querySelector('.match-name')?.innerText.includes(${JSON.stringify(intakeData.customerName)}));
    if (exactMatch) {
      exactMatch.click();
    } else {
      const newCustBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('new customer'));
      if (newCustBtn) newCustBtn.click();
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 3. Fill customer details if new customer fields appear
  await driver.eval(`(() => {
    const bands = document.querySelectorAll('section.band');
    const custBand = Array.from(bands).find(b => b.querySelector('.band-title')?.innerText.toUpperCase().includes('CUSTOMER'));
    if (custBand) {
      const inputs = custBand.querySelectorAll('input');
      if (inputs[0]) {
        inputs[0].value = ${JSON.stringify(intakeData.customerName)};
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[1]) {
        inputs[1].value = ${JSON.stringify(intakeData.phone)};
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[2] && ${JSON.stringify(intakeData.email || '')}) {
        inputs[2].value = ${JSON.stringify(intakeData.email || '')};
        inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 4. Vehicle: match vehicle button by plate or click "Another vehicle"
  await driver.eval(`(() => {
    const vehMatches = Array.from(document.querySelectorAll('.matches button.match'));
    const vehMatch = vehMatches.find(m => m.innerText.includes(${JSON.stringify(intakeData.plate)}));
    if (vehMatch) {
      vehMatch.click();
    } else {
      const anotherVeh = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Another vehicle'));
      if (anotherVeh) anotherVeh.click();
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 5. Fill vehicle inputs
  await driver.eval(`(() => {
    const bands = document.querySelectorAll('section.band');
    const vehBand = Array.from(bands).find(b => b.querySelector('.band-title')?.innerText.toUpperCase().includes('VEHICLE'));
    if (vehBand) {
      const inputs = vehBand.querySelectorAll('input');
      if (inputs[0]) {
        inputs[0].value = ${JSON.stringify(intakeData.plate)};
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (inputs[1]) {
        inputs[1].value = ${JSON.stringify(intakeData.vin || '')};
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
      const select = vehBand.querySelector('select');
      if (select && ${JSON.stringify(intakeData.category || 'CARS')}) {
        select.value = ${JSON.stringify(intakeData.category || 'CARS')};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 6. Fill complaint & select branch/tech
  await driver.eval(`(() => {
    const textarea = document.querySelector('textarea');
    if (textarea && ${JSON.stringify(intakeData.complaint || '')}) {
      textarea.value = ${JSON.stringify(intakeData.complaint || '')};
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const selects = document.querySelectorAll('section.band select');
    for (const select of selects) {
      if (${JSON.stringify(intakeData.branchId || '')}) {
        const opt = Array.from(select.options).find(o => o.value === ${JSON.stringify(intakeData.branchId || '')});
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (${JSON.stringify(intakeData.technicianId || '')}) {
        const opt = Array.from(select.options).find(o => o.value === ${JSON.stringify(intakeData.technicianId || '')});
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // 7. Check missing status & submit
  const status = await driver.eval(`(() => {
    const missing = document.querySelector('.missing')?.innerText;
    const submitBtn = Array.from(document.querySelectorAll('section.confirm button')).find(b => b.innerText.includes('Book in'));
    return { missing, btnDisabled: submitBtn?.disabled };
  })()`);
  console.log(`Intake missing check:`, status);

  await driver.eval(`(() => {
    const submitBtn = Array.from(document.querySelectorAll('section.confirm button')).find(b => b.innerText.includes('Book in'));
    if (submitBtn && !submitBtn.disabled) submitBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  const booked = await driver.eval(`(() => {
    const b = document.querySelector('.booked');
    const id = document.querySelector('.booked-id mop-identifier');
    return {
      workOrderId: id ? id.innerText.trim() : null,
      text: b ? b.innerText : null
    };
  })()`);
  console.log(`Booking Result:`, booked);

  let finalId = booked?.workOrderId;
  if (!finalId) {
    finalId = await findWorkOrderByPlate(driver, intakeData.plate);
  }
  return finalId;
}

async function run() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  try {
    console.log('==================================================');
    console.log('STARTING COMPLETE END-TO-END OPERATIONS SIMULATION');
    console.log('==================================================');

    // =========================================================================
    // WORKSHOP A: PRECISION MOTORS SERVICE CENTER
    // =========================================================================
    console.log('\n==================================================');
    console.log('WORKSHOP A: PRECISION MOTORS (Modern Multi-Service)');
    console.log('==================================================');

    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');

    const pmcMeta = await driver.eval(`(async () => {
      const branchesRes = await fetch('/api/v1/branch-manager/intake/branches');
      const branches = (await branchesRes.json()).branches;
      const techRes = await fetch('/api/v1/branch-manager/technicians');
      const techJson = await techRes.json();
      return { branches, techs: techJson.technicians || [] };
    })()`);
    console.log('PMC Branches:', pmcMeta.branches.map(b => b.code));
    console.log('PMC Technicians:', pmcMeta.techs.map(t => t.fullName));

    const pmcMain = pmcMeta.branches.find(b => b.code === 'PMC-MAIN') || pmcMeta.branches[0];
    const pmcExp = pmcMeta.branches.find(b => b.code === 'PMC-EXP') || pmcMeta.branches[1] || pmcMain;
    const techKarimA = pmcMeta.techs.find(t => t.fullName.includes('Karim')) || pmcMeta.techs[0];
    const techZiadA = pmcMeta.techs.find(t => t.fullName.includes('Ziad')) || pmcMeta.techs[1] || techKarimA;

    // -------------------------------------------------------------------------
    // VEHICLE A1 (Journey A: Routine Service -> Inspection -> Part -> Done -> Delivered)
    // -------------------------------------------------------------------------
    let a1WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Tariq Mansour',
      phone: '+201001112221',
      email: 'tariq.mansour@gmail.com',
      plate: 'PMC-701-EGY',
      vin: 'WDDZF4JB0PA109283',
      category: 'CARS',
      complaint: 'Scheduled 15,000 km minor service and front brake inspection',
      branchId: pmcMain.id,
      branchCode: pmcMain.code,
      technicianId: techKarimA.id
    });
    console.log(`Vehicle A1 Work Order ID: ${a1WorkOrderId}`);

    // Re-assign to Karim Mostafa to ensure active assignment
    await driver.navigate(`${BASE_URL}/branch/work-orders/${a1WorkOrderId}`);
    await new Promise(r => setTimeout(r, 1200));
    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techKarimA.id}' })
      });
    })()`);
    await new Promise(r => setTimeout(r, 800));

    // TECHNICIAN LOGIN: tech.karim@precision-motors.local
    await loginUser(driver, 'tech.karim@precision-motors.local', 'ChangeMe-Staff-123');
    await driver.navigate(`${BASE_URL}/tech/work-orders/${a1WorkOrderId}`);
    await new Promise(r => setTimeout(r, 1500));

    // Start inspection
    console.log('Technician Karim starting inspection on PMC-701-EGY...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}/start-inspection', { method: 'POST' });
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    // Complete inspection with "OK" (routine maintenance agreed at intake, auto-advances to APPROVED_FOR_WORK)
    console.log('Completing inspection with OK (routine service approved)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'QUICK',
          odometerOrHours: 15400,
          actualMinutes: 20,
          note: 'OK'
        })
      });
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    // Start work
    console.log('Starting work (IN_PROGRESS)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}/start-work', { method: 'POST' });
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    // Manager adds task: "Replace Front Ceramic Brake Pads"
    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Manager creating task for PMC-701-EGY...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Replace Front Ceramic Brake Pads',
          assignToStaffUserId: '${techKarimA.id}'
        })
      });
    })()`);
    await new Promise(r => setTimeout(r, 1200));

    // Technician requests part: PMC-BRK-PAD01
    await loginUser(driver, 'tech.karim@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Technician requesting part PMC-BRK-PAD01...');
    await driver.eval(`(async () => {
      const stockRes = await fetch('/api/v1/technician/parts-catalog?q=PMC-BRK-PAD01');
      const catalog = await stockRes.json();
      const item = catalog.items?.[0] || catalog.cards?.[0];
      const itemId = item?.id || item?.inventoryItemId;
      if (itemId) {
        await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryItemId: itemId,
            quantity: 1,
            reason: 'Front brake pads worn out'
          })
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Store keeper approves and issues part
    await loginUser(driver, 'inventory@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Storekeeper approving and issuing part from warehouse...');
    await driver.eval(`(async () => {
      const reqRes = await fetch('/api/v1/inventory/requests');
      const reqs = (await reqRes.json()).requests || [];
      const myReq = reqs.find(r => r.sku === 'PMC-BRK-PAD01');
      if (myReq) {
        await fetch('/api/v1/inventory/requests/' + myReq.id + '/approve', { method: 'POST' });
        const sourceWh = myReq.sources?.[0]?.warehouseId;
        if (sourceWh) {
          await fetch('/api/v1/inventory/requests/' + myReq.id + '/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouseId: sourceWh, quantity: 1 })
          });
        }
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Technician receives and marks used, completes task, and finishes work order
    await loginUser(driver, 'tech.karim@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Technician receiving part, marking used, completing task, and finishing...');
    await driver.eval(`(async () => {
      const cardRes = await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}');
      const card = await cardRes.json();
      const part = card.parts?.[0];
      if (part) {
        await fetch('/api/v1/technician/parts/' + part.partRequestId + '/receive', { method: 'POST' });
        await fetch('/api/v1/technician/parts/' + part.partRequestId + '/used', { method: 'POST' });
      }
      const task = card.tasks?.[0];
      if (task) {
        await fetch('/api/v1/technician/tasks/' + task.id + '/start', { method: 'POST' });
        await fetch('/api/v1/technician/tasks/' + task.id + '/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutesSpent: 35 })
        });
      }
      await fetch('/api/v1/technician/work-orders/${a1WorkOrderId}/finish', { method: 'POST' });
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Manager advances through review / QC and delivers
    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Manager delivering vehicle A1 (PMC-701-EGY)...');
    await driver.eval(`(async () => {
      let woRes = await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}');
      let wo = await woRes.json();
      while (wo.status === 'READY_FOR_TEAM_REVIEW' || wo.status === 'READY_FOR_QC') {
        await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passed: true })
        });
        await new Promise(r => setTimeout(r, 600));
        woRes = await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}');
        wo = await woRes.json();
      }
      if (wo.status === 'READY_FOR_DELIVERY') {
        await fetch('/api/v1/branch-manager/work-orders/${a1WorkOrderId}/deliver', { method: 'POST' });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));
    console.log('Journey A successfully completed! PMC-701-EGY is DELIVERED / CLOSED.');

    // -------------------------------------------------------------------------
    // VEHICLE A2 (Journey B: Complex Diagnostics -> Fault -> Customer Approval -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    const a2WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Dr. Sherif Nour',
      phone: '+201001112222',
      email: 'sherif.nour@hospital.eg',
      plate: 'PMC-702-EGY',
      vin: 'WBA5R1C50NFP81203',
      category: 'CARS',
      complaint: 'Engine misfire under load, check engine light on, rough idle on cold start',
      branchId: pmcMain.id,
      branchCode: pmcMain.code,
      technicianId: techZiadA.id
    });
    console.log(`Vehicle A2 Work Order ID: ${a2WorkOrderId}`);

    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${a2WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techZiadA.id}' })
      });
    })()`);

    await loginUser(driver, 'tech.ziad@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Starting inspection and diagnosing BMW 330i (PMC-702-EGY)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${a2WorkOrderId}/start-inspection', { method: 'POST' });
      const faultRes = await fetch('/api/v1/technician/work-orders/${a2WorkOrderId}/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'High Pressure Fuel Pump failure causing low fuel rail pressure and misfire',
          severity: 'HIGH',
          code: 'P0087',
          recommendedService: 'HPFP Replacement & Spark Plugs'
        })
      });
      const fault = await faultRes.json();
      await fetch('/api/v1/technician/work-orders/${a2WorkOrderId}/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Replace High Pressure Fuel Pump & 4 Iridium Plugs',
          explanation: 'Low fuel pressure causes dangerous engine cutting under acceleration. Requires replacement of HPFP and fouled spark plugs.',
          importance: 'HIGH',
          price: '12500.00',
          laborPrice: '2500.00',
          faultId: fault.id
        })
      });
      await fetch('/api/v1/technician/work-orders/${a2WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FULL',
          odometerOrHours: 42300,
          actualMinutes: 45,
          note: 'Scanned OBD2 codes P0087 and P0301. Fuel rail pressure drop confirmed.'
        })
      });
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Manager records customer verbal approval
    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');
    console.log('Recording customer approval for BMW 330i...');
    await driver.eval(`(async () => {
      const approvalsRes = await fetch('/api/v1/branch-manager/approvals');
      const approvals = await approvalsRes.json();
      const req = approvals.requests?.find(r => r.workOrderId === '${a2WorkOrderId}');
      if (req) {
        const detailRes = await fetch('/api/v1/branch-manager/approvals/' + req.id);
        const detail = await detailRes.json();
        const answers = detail.items.map(i => ({ itemId: i.id, decision: 'APPROVED' }));
        await fetch('/api/v1/branch-manager/approvals/' + req.id + '/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers, evidenceReference: 'Customer approved over phone call at 11:30 AM' })
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Tech starts work -> IN_PROGRESS
    await loginUser(driver, 'tech.ziad@precision-motors.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${a2WorkOrderId}/start-work', { method: 'POST' });
    })()`);
    console.log('Journey B successfully completed! BMW 330i is APPROVED and IN_PROGRESS.');

    // -------------------------------------------------------------------------
    // VEHICLE A3 (Group 3: Fresh Arrival left in REGISTERED at PMC-EXP)
    // -------------------------------------------------------------------------
    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');
    const a3WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Yasmine Fayed',
      phone: '+201001112223',
      email: 'yasmine.fayed@outlook.com',
      plate: 'PMC-703-EGY',
      category: 'CARS',
      complaint: 'Annual 20,000 km scheduled maintenance check',
      branchId: pmcExp.id,
      branchCode: pmcExp.code
    });
    console.log(`Fresh arrival PMC-703-EGY booked in (${a3WorkOrderId}) and left in REGISTERED.`);


    // =========================================================================
    // WORKSHOP B: HERITAGE AUTO RESTORATION
    // =========================================================================
    console.log('\n==================================================');
    console.log('WORKSHOP B: HERITAGE AUTO RESTORATION (Classic / Vintage)');
    console.log('==================================================');

    await loginUser(driver, 'manager@heritage-restoration.local', 'ChangeMe-Staff-123');

    const harMeta = await driver.eval(`(async () => {
      const branchesRes = await fetch('/api/v1/branch-manager/intake/branches');
      const branches = (await branchesRes.json()).branches;
      const techRes = await fetch('/api/v1/branch-manager/technicians');
      const techJson = await techRes.json();
      return { branches, techs: techJson.technicians || [] };
    })()`);
    console.log('HAR Branches:', harMeta.branches.map(b => b.code));
    console.log('HAR Technicians:', harMeta.techs.map(t => t.fullName));

    const harMain = harMeta.branches[0];
    const techMahmoudB = harMeta.techs.find(t => t.fullName.includes('Mahmoud')) || harMeta.techs[0];
    const techYoussefB = harMeta.techs.find(t => t.fullName.includes('Youssef')) || harMeta.techs[1] || techMahmoudB;

    // -------------------------------------------------------------------------
    // VEHICLE B1 (Journey C: Customer Decision Rejected -> CANCELLED)
    // -------------------------------------------------------------------------
    const b1WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Hisham El-Gammal',
      phone: '+201002223331',
      plate: 'HAR-1974-VNT',
      vin: 'AR115020004921',
      category: 'CARS',
      complaint: 'Severe engine oil leak from rear main seal and rust bubbling on rocker sill',
      branchId: harMain.id,
      branchCode: harMain.code,
      technicianId: techMahmoudB.id
    });
    console.log(`Vehicle B1 Work Order ID: ${b1WorkOrderId}`);

    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${b1WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techMahmoudB.id}' })
      });
    })()`);

    await loginUser(driver, 'mechanic@heritage-restoration.local', 'ChangeMe-Staff-123');
    console.log('Mechanic inspecting 1974 Alfa Romeo Spider (HAR-1974-VNT)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${b1WorkOrderId}/start-inspection', { method: 'POST' });
      const faultRes = await fetch('/api/v1/technician/work-orders/${b1WorkOrderId}/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Severe floor pan rust penetration and cracked rear main bearing journal',
          severity: 'CRITICAL',
          recommendedService: 'Complete Chassis Strip & Welding'
        })
      });
      const fault = await faultRes.json();
      await fetch('/api/v1/technician/work-orders/${b1WorkOrderId}/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Chassis Structural Restoration & Engine Rebuild',
          explanation: 'Structural rust threatens vehicle integrity. Major fabrication required.',
          importance: 'CRITICAL',
          price: '55000.00',
          laborPrice: '30000.00',
          faultId: fault.id
        })
      });
      await fetch('/api/v1/technician/work-orders/${b1WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FULL',
          odometerOrHours: 124000,
          actualMinutes: 60,
          note: 'Extensive chassis inspection completed. Vehicle deemed unsafe in current state.'
        })
      });
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Customer rejects repair via approvals
    await loginUser(driver, 'manager@heritage-restoration.local', 'ChangeMe-Staff-123');
    console.log('Customer rejects 85,000 EGP quote for Alfa Romeo...');
    await driver.eval(`(async () => {
      const approvalsRes = await fetch('/api/v1/branch-manager/approvals');
      const approvals = await approvalsRes.json();
      const req = approvals.requests?.find(r => r.workOrderId === '${b1WorkOrderId}');
      if (req) {
        const detailRes = await fetch('/api/v1/branch-manager/approvals/' + req.id);
        const detail = await detailRes.json();
        const answers = detail.items.map(i => ({ itemId: i.id, decision: 'REJECTED' }));
        await fetch('/api/v1/branch-manager/approvals/' + req.id + '/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers, evidenceReference: 'Customer declined repair due to budget constraints' })
        });
      }
    })()`);
    console.log('Journey C successfully completed! Alfa Romeo decision REJECTED.');

    // -------------------------------------------------------------------------
    // VEHICLE B2 (Journey D: Blocked State - Missing Vintage Part)
    // -------------------------------------------------------------------------
    const b2WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Omar Abdel-Latif',
      phone: '+201002223332',
      plate: 'HAR-1968-VNT',
      vin: '1E34892JAG',
      category: 'CARS',
      complaint: 'Carburetor diaphragm torn, mechanical fuel pump leaking internally',
      branchId: harMain.id,
      branchCode: harMain.code,
      technicianId: techYoussefB.id
    });
    console.log(`Vehicle B2 Work Order ID: ${b2WorkOrderId}`);

    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${b2WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techYoussefB.id}' })
      });
    })()`);

    await loginUser(driver, 'body@heritage-restoration.local', 'ChangeMe-Staff-123');
    console.log('Starting inspection on 1968 Jaguar E-Type (HAR-1968-VNT)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${b2WorkOrderId}/start-inspection', { method: 'POST' });
      await fetch('/api/v1/technician/work-orders/${b2WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'QUICK',
          odometerOrHours: 87000,
          actualMinutes: 30,
          note: 'OK'
        })
      });
      await fetch('/api/v1/technician/work-orders/${b2WorkOrderId}/start-work', { method: 'POST' });

      // Request HAR-MEC-PMP99 (which has 0 stock!)
      const stockRes = await fetch('/api/v1/technician/parts-catalog?q=HAR-MEC-PMP99');
      const catalog = await stockRes.json();
      const item = catalog.items?.[0] || catalog.cards?.[0];
      const itemId = item?.id || item?.inventoryItemId;
      if (itemId) {
        await fetch('/api/v1/technician/work-orders/${b2WorkOrderId}/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryItemId: itemId,
            quantity: 1,
            reason: 'Rare vintage fuel pump required'
          })
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Store manager marks part unavailable
    await loginUser(driver, 'parts@heritage-restoration.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      const reqRes = await fetch('/api/v1/inventory/requests');
      const reqs = (await reqRes.json()).requests || [];
      const myReq = reqs.find(r => r.sku === 'HAR-MEC-PMP99');
      if (myReq) {
        await fetch('/api/v1/inventory/requests/' + myReq.id + '/unavailable', { method: 'POST' });
      }
    })()`);
    console.log('Journey D successfully completed! 1968 Jaguar E-Type is BLOCKED on missing parts (WAITING_PARTS).');

    // -------------------------------------------------------------------------
    // VEHICLE B3 (Group 3: Vintage Fresh Arrival)
    // -------------------------------------------------------------------------
    await loginUser(driver, 'manager@heritage-restoration.local', 'ChangeMe-Staff-123');
    const b3WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Karim Sabry',
      phone: '+201002223333',
      plate: 'HAR-1965-VNT',
      category: 'CARS',
      complaint: 'Initial intake for complete body restoration assessment',
      branchId: harMain.id,
      branchCode: harMain.code
    });
    console.log(`Fresh arrival HAR-1965-VNT booked in (${b3WorkOrderId}) and left in REGISTERED.`);


    // =========================================================================
    // WORKSHOP C: RAPID FLEET & COMMERCIAL GARAGE
    // =========================================================================
    console.log('\n==================================================');
    console.log('WORKSHOP C: RAPID FLEET & COMMERCIAL GARAGE');
    console.log('==================================================');

    await loginUser(driver, 'manager@rapid-fleet.local', 'ChangeMe-Staff-123');

    const rfcMeta = await driver.eval(`(async () => {
      const branchesRes = await fetch('/api/v1/branch-manager/intake/branches');
      const branches = (await branchesRes.json()).branches;
      const techRes = await fetch('/api/v1/branch-manager/technicians');
      const techJson = await techRes.json();
      return { branches, techs: techJson.technicians || [] };
    })()`);
    console.log('RFC Branches:', rfcMeta.branches.map(b => b.code));
    console.log('RFC Technicians:', rfcMeta.techs.map(t => t.fullName));

    const rfcOps = rfcMeta.branches.find(b => b.code === 'RFC-OPS') || rfcMeta.branches[0];
    const rfcComm = rfcMeta.branches.find(b => b.code === 'RFC-COMM') || rfcMeta.branches[1] || rfcOps;
    const techAhmedC = rfcMeta.techs.find(t => t.fullName.includes('Ahmed')) || rfcMeta.techs[0];
    const techTamerC = rfcMeta.techs.find(t => t.fullName.includes('Tamer')) || rfcMeta.techs[1] || techAhmedC;

    // -------------------------------------------------------------------------
    // VEHICLE C1 (Journey E: Urgent Commercial Vehicle - Rapid Turnaround -> Ready for Delivery)
    // -------------------------------------------------------------------------
    const c1WorkOrderId = await bookInVehicle(driver, {
      customerName: 'National Express Logistics',
      phone: '+201003334441',
      email: 'dispatch@national-express.com',
      plate: 'RFC-901-FLT',
      vin: 'WF0YXXTTGYLK88123',
      category: 'CARS',
      complaint: 'URGENT FLEET: Front brake pads worn to metal, scheduled delivery route at 4 PM',
      branchId: rfcOps.id,
      branchCode: rfcOps.code,
      technicianId: techAhmedC.id
    });
    console.log(`Vehicle C1 Work Order ID: ${c1WorkOrderId}`);

    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${c1WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techAhmedC.id}' })
      });
    })()`);

    await loginUser(driver, 'tech.ahmed@rapid-fleet.local', 'ChangeMe-Staff-123');
    console.log('Lead tech performing rapid repair on Ford Transit (RFC-901-FLT)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}/start-inspection', { method: 'POST' });
      await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'QUICK',
          odometerOrHours: 78500,
          actualMinutes: 15,
          note: 'OK'
        })
      });
      await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}/start-work', { method: 'POST' });

      // Request RFC-BRK-PAD99
      const stockRes = await fetch('/api/v1/technician/parts-catalog?q=RFC-BRK-PAD99');
      const catalog = await stockRes.json();
      const item = catalog.items?.[0] || catalog.cards?.[0];
      const itemId = item?.id || item?.inventoryItemId;
      if (itemId) {
        await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryItemId: itemId,
            quantity: 2,
            reason: 'Heavy duty commercial pad replacement'
          })
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Store issues parts
    await loginUser(driver, 'warehouse@rapid-fleet.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      const reqRes = await fetch('/api/v1/inventory/requests');
      const reqs = (await reqRes.json()).requests || [];
      const myReq = reqs.find(r => r.sku === 'RFC-BRK-PAD99');
      if (myReq) {
        await fetch('/api/v1/inventory/requests/' + myReq.id + '/approve', { method: 'POST' });
        const sourceWh = myReq.sources?.[0]?.warehouseId;
        if (sourceWh) {
          await fetch('/api/v1/inventory/requests/' + myReq.id + '/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouseId: sourceWh, quantity: 2 })
          });
        }
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Tech receives & marks used -> finishes work
    await loginUser(driver, 'tech.ahmed@rapid-fleet.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      const cardRes = await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}');
      const card = await cardRes.json();
      const part = card.parts?.[0];
      if (part) {
        await fetch('/api/v1/technician/parts/' + part.partRequestId + '/receive', { method: 'POST' });
        await fetch('/api/v1/technician/parts/' + part.partRequestId + '/used', { method: 'POST' });
      }
      await fetch('/api/v1/technician/work-orders/${c1WorkOrderId}/finish', { method: 'POST' });
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Manager advances through review/QC to READY_FOR_DELIVERY
    await loginUser(driver, 'manager@rapid-fleet.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      let woRes = await fetch('/api/v1/branch-manager/work-orders/${c1WorkOrderId}');
      let wo = await woRes.json();
      while (wo.status === 'READY_FOR_TEAM_REVIEW' || wo.status === 'READY_FOR_QC') {
        await fetch('/api/v1/branch-manager/work-orders/${c1WorkOrderId}/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passed: true })
        });
        await new Promise(r => setTimeout(r, 600));
        woRes = await fetch('/api/v1/branch-manager/work-orders/${c1WorkOrderId}');
        wo = await woRes.json();
      }
    })()`);
    console.log('Journey E successfully completed! Ford Transit is READY FOR DELIVERY.');

    // -------------------------------------------------------------------------
    // VEHICLE C2 (Journey F: Active In-Progress Fleet Work Order)
    // -------------------------------------------------------------------------
    const c2WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Cairo Distribution Services',
      phone: '+201003334442',
      plate: 'RFC-902-FLT',
      vin: 'JTDFB12P600192837',
      category: 'CARS',
      complaint: 'Battery dying during deliveries, slow cranking on morning shifts',
      branchId: rfcComm.id,
      branchCode: rfcComm.code,
      technicianId: techTamerC.id
    });
    console.log(`Vehicle C2 Work Order ID: ${c2WorkOrderId}`);

    await driver.eval(`(async () => {
      await fetch('/api/v1/branch-manager/work-orders/${c2WorkOrderId}/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId: '${techTamerC.id}' })
      });
    })()`);

    await loginUser(driver, 'tech.tamer@rapid-fleet.local', 'ChangeMe-Staff-123');
    console.log('Field tech starting active repair on Toyota HiAce (RFC-902-FLT)...');
    await driver.eval(`(async () => {
      await fetch('/api/v1/technician/work-orders/${c2WorkOrderId}/start-inspection', { method: 'POST' });
      await fetch('/api/v1/technician/work-orders/${c2WorkOrderId}/inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'QUICK',
          odometerOrHours: 112000,
          actualMinutes: 20,
          note: 'OK'
        })
      });
      await fetch('/api/v1/technician/work-orders/${c2WorkOrderId}/start-work', { method: 'POST' });

      // Request battery RFC-BAT-24V18
      const stockRes = await fetch('/api/v1/technician/parts-catalog?q=RFC-BAT-24V18');
      const catalog = await stockRes.json();
      const item = catalog.items?.[0] || catalog.cards?.[0];
      const itemId = item?.id || item?.inventoryItemId;
      if (itemId) {
        await fetch('/api/v1/technician/work-orders/${c2WorkOrderId}/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryItemId: itemId,
            quantity: 1,
            reason: 'Fleet battery replacement'
          })
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Store issues battery
    await loginUser(driver, 'warehouse@rapid-fleet.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      const reqRes = await fetch('/api/v1/inventory/requests');
      const reqs = (await reqRes.json()).requests || [];
      const myReq = reqs.find(r => r.sku === 'RFC-BAT-24V18');
      if (myReq) {
        await fetch('/api/v1/inventory/requests/' + myReq.id + '/approve', { method: 'POST' });
        const sourceWh = myReq.sources?.[0]?.warehouseId;
        if (sourceWh) {
          await fetch('/api/v1/inventory/requests/' + myReq.id + '/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouseId: sourceWh, quantity: 1 })
          });
        }
      }
    })()`);
    await new Promise(r => setTimeout(r, 1500));

    // Field tech receives battery -> left IN_PROGRESS
    await loginUser(driver, 'tech.tamer@rapid-fleet.local', 'ChangeMe-Staff-123');
    await driver.eval(`(async () => {
      const cardRes = await fetch('/api/v1/technician/work-orders/${c2WorkOrderId}');
      const card = await cardRes.json();
      const part = card.parts?.[0];
      if (part) {
        await fetch('/api/v1/technician/parts/' + part.partRequestId + '/receive', { method: 'POST' });
      }
    })()`);
    console.log('Journey F successfully completed! Toyota HiAce is an ACTIVE IN-PROGRESS REPAIR.');

    // -------------------------------------------------------------------------
    // VEHICLE C3 (Group 3: Heavy Fleet Fresh Arrival)
    // -------------------------------------------------------------------------
    await loginUser(driver, 'manager@rapid-fleet.local', 'ChangeMe-Staff-123');
    const c3WorkOrderId = await bookInVehicle(driver, {
      customerName: 'Nile Courier Fleet',
      phone: '+201003334443',
      plate: 'RFC-903-FLT',
      category: 'CARS',
      complaint: 'Scheduled 50,000 km commercial fleet inspection',
      branchId: rfcOps.id,
      branchCode: rfcOps.code
    });
    console.log(`Fresh arrival RFC-903-FLT booked in (${c3WorkOrderId}) and left in REGISTERED.`);

    console.log('\n==================================================');
    console.log('ALL OPERATIONS AND JOURNEYS SIMULATED ACROSS 3 WORKSHOPS!');
    console.log('==================================================');
  } catch (err) {
    console.error('Error during operations simulation:', err);
  } finally {
    await driver.close();
  }
}

run();
