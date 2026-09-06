import { BrowserDriver } from './browser-driver.mjs';

async function createWorkshop(driver, ws) {
  console.log(`\n========================================`);
  console.log(`Creating Workshop: ${ws.name}`);
  console.log(`========================================`);

  // Navigate to Onboarding
  await driver.navigate('http://localhost:4200/platform/workshops/new');
  await new Promise(r => setTimeout(r, 1500));

  // Stage 1: Identity
  console.log('--- Stage 1: Identity ---');
  await driver.fill('#ws-name', ws.name);
  await driver.fill('#ws-slug', ws.slug);

  // Fill country
  await driver.fill('#ws-country', 'Egypt');
  await new Promise(r => setTimeout(r, 500));
  await driver.eval(`(() => {
    const opt = document.querySelector('.onb-country-option');
    if (opt) opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  })()`);
  await new Promise(r => setTimeout(r, 400));
  await driver.fill('#ws-city', ws.city);

  // Business type
  await driver.eval(`(() => {
    const sel = document.querySelector('#ws-business-type');
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);

  // Category
  await driver.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('.onb-choice'));
    const btn = buttons.find(b => b.innerText.includes(${JSON.stringify(ws.category)})) || buttons[0];
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 400));

  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 2: Plan
  console.log('--- Stage 2: Plan ---');
  await driver.eval(`(() => {
    const plans = Array.from(document.querySelectorAll('.onb-plan'));
    const full = plans.find(p => p.innerText.includes('Full Service')) || plans[0];
    if (full) full.click();
  })()`);

  await driver.fill('#owner-name', ws.ownerName);
  await driver.fill('#owner-email', ws.ownerEmail);
  await driver.fill('#owner-phone', ws.ownerPhone);

  await driver.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('.onb-choice'));
    const active = btns.find(b => b.innerText.includes('ACTIVE'));
    if (active) active.click();
  })()`);

  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 3: Capabilities
  console.log('--- Stage 3: Capabilities ---');
  await driver.eval(`(() => {
    const shapes = Array.from(document.querySelectorAll('.onb-shape'));
    const full = shapes.find(s => s.innerText.includes('Full-service')) || shapes[0];
    if (full) full.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 4: Specialization
  console.log('--- Stage 4: Specialization ---');
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 5: Policies
  console.log('--- Stage 5: Policies ---');
  await driver.eval(`(() => {
    const btn = document.querySelector('.onb-policy-defaults');
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 6: Responsibility
  console.log('--- Stage 6: Responsibility ---');
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 7: Structure
  console.log('--- Stage 7: Structure ---');
  // Branches
  for (let i = 0; i < ws.branches.length; i++) {
    const curCount = await driver.eval(`document.querySelectorAll('[id^="branch-name-"]').length`);
    if (i >= curCount) {
      await driver.clickText('Add a branch', 'button');
      await new Promise(r => setTimeout(r, 300));
    }
    await driver.fill(`#branch-name-${i}`, ws.branches[i].name);
    await driver.fill(`#branch-code-${i}`, ws.branches[i].code);
    await driver.fill(`#branch-city-${i}`, ws.branches[i].city);
  }

  // Warehouses
  for (let i = 0; i < ws.warehouses.length; i++) {
    const curCount = await driver.eval(`document.querySelectorAll('[id^="wh-name-"]').length`);
    if (i >= curCount) {
      await driver.clickText('Add a store', 'button');
      await new Promise(r => setTimeout(r, 300));
    }
    await driver.fill(`#wh-name-${i}`, ws.warehouses[i].name);
    await driver.fill(`#wh-code-${i}`, ws.warehouses[i].code);
  }

  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 8: Services
  console.log('--- Stage 8: Services ---');
  for (let i = 0; i < ws.services.length; i++) {
    const curCount = await driver.eval(`document.querySelectorAll('[id^="svc-name-"]').length`);
    if (i >= curCount) {
      await driver.clickText('Add a service', 'button');
      await new Promise(r => setTimeout(r, 300));
    }
    await driver.fill(`#svc-name-${i}`, ws.services[i].name);
    await driver.fill(`#svc-price-${i}`, ws.services[i].price);
  }

  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 9: Review
  console.log('--- Stage 9: Review ---');
  await driver.clickText('Create this workshop', 'button');
  console.log('Clicked Create this workshop, awaiting completion...');
  await new Promise(r => setTimeout(r, 4000));

  // Capture owner invite link
  const captured = await driver.eval(`window.__mop_captured`);
  const pub = captured?.reverse().find(c => c.url?.includes('/platform/workshops') && c.data?.ownerInvitation?.link);
  const ownerInviteLink = pub?.data?.ownerInvitation?.link;
  console.log(`Owner invite link for ${ws.name}:`, ownerInviteLink);

  // Accept owner invite
  if (ownerInviteLink) {
    console.log(`Setting password for Owner (${ws.ownerEmail})...`);
    await driver.navigate(`http://localhost:4200${ownerInviteLink}`);
    await new Promise(r => setTimeout(r, 1200));
    await driver.fill('input[type="password"]', ws.ownerPassword);
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      if (inputs.length > 1) {
        inputs[1].value = ${JSON.stringify(ws.ownerPassword)};
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 400));
    await driver.click('button.primary');
    await new Promise(r => setTimeout(r, 1500));
    console.log(`Owner account activated for ${ws.ownerEmail}!`);
  }

  return pub?.data?.tenant?.id;
}

async function setupStaffForWorkshop(driver, ws) {
  console.log(`\n--- Setting up staff for ${ws.name} ---`);
  // Login as workshop owner
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', ws.ownerEmail);
  await driver.fill('input[type="password"], input[name="password"], #password', ws.ownerPassword);
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  // Navigate to Organization
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1200));

  // Get infrastructure to find branch and warehouse IDs
  const infra = await driver.eval(`(() => {
    const captured = window.__mop_captured;
    const req = captured?.reverse().find(c => c.url?.includes('/infrastructure'));
    return req?.data;
  })()`);

  const branchId = infra?.branches?.[0]?.id || '';
  const warehouseId = infra?.warehouses?.[0]?.id || '';

  // Invite staff
  for (const staff of ws.staff) {
    console.log(`Inviting ${staff.fullName} (${staff.role})...`);
    await driver.clickText('+ Invite Staff', 'button');
    await new Promise(r => setTimeout(r, 500));

    await driver.eval(`(() => {
      const modal = document.querySelector('.modal');
      const inputs = modal.querySelectorAll('input');
      inputs[0].value = ${JSON.stringify(staff.fullName)};
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      inputs[1].value = ${JSON.stringify(staff.email)};
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

      inputs[2].value = ${JSON.stringify(staff.phone)};
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.querySelector('select');
      select.value = ${JSON.stringify(staff.role)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await new Promise(r => setTimeout(r, 300));

    if (staff.role === 'BRANCH_MANAGER') {
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const inputs = Array.from(modal.querySelectorAll('input'));
        const inp = inputs.find(i => i.parentElement?.innerText?.includes('Branch scope'));
        if (inp) {
          inp.value = ${JSON.stringify(branchId)};
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 300));
    }

    if (staff.role === 'INVENTORY_MANAGER') {
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const inputs = Array.from(modal.querySelectorAll('input'));
        const inp = inputs.find(i => i.parentElement?.innerText?.includes('Warehouse scope'));
        if (inp) {
          inp.value = ${JSON.stringify(warehouseId)};
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 300));
    }

    await driver.clickText('Send Invite', 'button');
    await new Promise(r => setTimeout(r, 1200));
  }

  // Activate all invited staff via banner
  const rowsCount = await driver.eval(`document.querySelectorAll('tbody tr').length`);
  for (let i = 0; i < rowsCount; i++) {
    const rowInfo = await driver.eval(`(() => {
      const rows = document.querySelectorAll('tbody tr');
      const r = rows[${i}];
      if (!r) return null;
      const name = r.querySelectorAll('td')[0]?.innerText.trim();
      const btn = Array.from(r.querySelectorAll('button')).find(b => b.innerText.includes('Invite link'));
      if (btn) {
        btn.click();
        return { name, clicked: true };
      }
      return { name, clicked: false };
    })()`);

    if (rowInfo?.clicked) {
      await new Promise(r => setTimeout(r, 600));
      const inviteUrl = await driver.eval(`document.querySelector('.state a.link')?.href`);
      if (inviteUrl) {
        console.log(`Setting password for ${rowInfo.name} via ${inviteUrl}...`);
        await driver.navigate(inviteUrl);
        await new Promise(r => setTimeout(r, 1000));
        await driver.fill('input[type="password"]', 'ChangeMe-Staff-123');
        await driver.eval(`(() => {
          const inputs = document.querySelectorAll('input[type="password"]');
          if (inputs.length > 1) {
            inputs[1].value = 'ChangeMe-Staff-123';
            inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`);
        await new Promise(r => setTimeout(r, 400));
        await driver.click('button.primary');
        await new Promise(r => setTimeout(r, 1200));
        console.log(`Activated ${rowInfo.name}!`);

        // Return to organization page
        await driver.navigate('http://localhost:4200/owner/organization');
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  console.log(`Staff setup complete for ${ws.name}!`);
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  const workshopB = {
    name: 'Heritage Auto Restoration',
    slug: 'heritage-restoration',
    city: 'Giza',
    category: 'Cars',
    ownerName: 'Fouad El-Sayed',
    ownerEmail: 'owner@heritage-restoration.local',
    ownerPhone: '+201022223333',
    ownerPassword: 'ChangeMe-Heritage-123',
    branches: [
      { name: 'Restoration Workshop', code: 'HAR-MAIN', city: 'Giza' }
    ],
    warehouses: [
      { name: 'Classic Mechanical Parts Warehouse', code: 'HAR-WH-MEC' },
      { name: 'Salvaged Parts Storage', code: 'HAR-WH-SLV' },
      { name: 'Restoration Materials Store', code: 'HAR-WH-MAT' }
    ],
    services: [
      { name: 'Complete Classic Vehicle Overhaul', price: '2500' },
      { name: 'Body & Frame Rust Restoration', price: '1800' },
      { name: 'Custom Carburetor & Fuel Tuning', price: '650' },
      { name: 'Vintage Electrical Rewiring', price: '950' }
    ],
    staff: [
      { fullName: 'Mostafa Kamel', email: 'manager@heritage-restoration.local', phone: '+201022220001', role: 'BRANCH_MANAGER' },
      { fullName: 'Mahmoud Ezzat', email: 'mechanic@heritage-restoration.local', phone: '+201022220002', role: 'TECHNICIAN' },
      { fullName: 'Youssef Nabil', email: 'body@heritage-restoration.local', phone: '+201022220003', role: 'TECHNICIAN' },
      { fullName: 'Nader Helmy', email: 'parts@heritage-restoration.local', phone: '+201022220004', role: 'INVENTORY_MANAGER' }
    ]
  };

  const workshopC = {
    name: 'Rapid Fleet & Commercial Garage',
    slug: 'rapid-fleet',
    city: 'Alexandria',
    category: 'Cars',
    ownerName: 'Gamal Abdel-Rahman',
    ownerEmail: 'owner@rapid-fleet.local',
    ownerPhone: '+201033334444',
    ownerPassword: 'ChangeMe-RapidFleet-123',
    branches: [
      { name: 'Fleet Operations Center', code: 'RFC-OPS', city: 'Alexandria' },
      { name: 'Commercial Service Point', code: 'RFC-COMM', city: 'Borg El Arab' }
    ],
    warehouses: [
      { name: 'Central Fleet Warehouse', code: 'RFC-WH-CEN' },
      { name: 'Heavy Parts Warehouse', code: 'RFC-WH-HVY' },
      { name: 'Emergency Consumables Store', code: 'RFC-WH-EMG' }
    ],
    services: [
      { name: 'Commercial Multi-Point Safety Inspection', price: '280' },
      { name: 'Heavy Duty Brake Service', price: '600' },
      { name: 'Rapid Engine Oil & Filter Change', price: '220' },
      { name: 'Commercial Battery & Alternator Replacement', price: '480' }
    ],
    staff: [
      { fullName: 'Hazem Shawky', email: 'manager@rapid-fleet.local', phone: '+201033330001', role: 'BRANCH_MANAGER' },
      { fullName: 'Ahmed Sherif', email: 'tech.ahmed@rapid-fleet.local', phone: '+201033330002', role: 'TECHNICIAN' },
      { fullName: 'Tamer Galal', email: 'tech.tamer@rapid-fleet.local', phone: '+201033330003', role: 'TECHNICIAN' },
      { fullName: 'Moamen Fikry', email: 'warehouse@rapid-fleet.local', phone: '+201033330004', role: 'INVENTORY_MANAGER' }
    ]
  };

  // Login as platform admin first
  console.log('Logging in as Platform Admin...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', 'platform-admin@mop.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Platform-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  // Create Workshop B
  await createWorkshop(driver, workshopB);

  // Setup staff for Workshop B
  await setupStaffForWorkshop(driver, workshopB);

  // Re-login as platform admin
  console.log('Re-logging in as Platform Admin for Workshop C...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', 'platform-admin@mop.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Platform-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  // Create Workshop C
  await createWorkshop(driver, workshopC);

  // Setup staff for Workshop C
  await setupStaffForWorkshop(driver, workshopC);

  console.log('\n========================================');
  console.log('WORKSHOPS A, B, AND C FULLY CREATED AND ACTIVATED!');
  console.log('========================================');

  driver.close();
}

main().catch(console.error);
