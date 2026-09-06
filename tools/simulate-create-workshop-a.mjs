import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Connected to Chrome');

  // Step 1: Login as Platform Admin
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));

  await driver.fill('input[type="email"], input[name="email"], #email', 'platform-admin@mop.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Platform-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Logged in as platform admin, current URL:', await driver.getUrl());

  // Step 2: Navigate to Onboarding
  await driver.navigate('http://localhost:4200/platform/workshops/new');
  await new Promise(r => setTimeout(r, 1500));

  // Stage 1: Identity
  console.log('--- Stage 1: Identity ---');
  await driver.fill('#ws-name', 'Precision Motors Service Center');
  await driver.fill('#ws-slug', 'precision-motors');
  
  // Fill country
  await driver.fill('#ws-country', 'Egypt');
  await new Promise(r => setTimeout(r, 500));
  // Click first matching country in list
  await driver.eval(`(() => {
    const opt = document.querySelector('.onb-country-option');
    if (opt) opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  })()`);
  await new Promise(r => setTimeout(r, 500));

  await driver.fill('#ws-city', 'Cairo');

  // Business type
  await driver.eval(`(() => {
    const sel = document.querySelector('#ws-business-type');
    if (sel && sel.options.length > 1) {
      sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);

  // Category: Cars
  await driver.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('.onb-choice'));
    const carBtn = buttons.find(b => b.innerText.includes('Cars'));
    if (carBtn) carBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Click Continue
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 2: Plan
  console.log('--- Stage 2: Plan ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  // Select full service plan
  await driver.eval(`(() => {
    const plans = Array.from(document.querySelectorAll('.onb-plan'));
    const full = plans.find(p => p.innerText.includes('Full Service')) || plans[0];
    if (full) full.click();
  })()`);

  await driver.fill('#owner-name', 'Tariq Al-Mansoor');
  await driver.fill('#owner-email', 'owner@precision-motors.local');
  await driver.fill('#owner-phone', '+201011112222');

  // Initial status: ACTIVE
  await driver.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('.onb-choice'));
    const active = btns.find(b => b.innerText.includes('ACTIVE'));
    if (active) active.click();
  })()`);

  // Click Continue
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 3: Capabilities
  console.log('--- Stage 3: Capabilities ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  // Select Full-service shape
  await driver.eval(`(() => {
    const shapes = Array.from(document.querySelectorAll('.onb-shape'));
    const full = shapes.find(s => s.innerText.includes('Full-service')) || shapes[0];
    if (full) full.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Click Continue
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 4: Specialization
  console.log('--- Stage 4: Specialization ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 5: Policies
  console.log('--- Stage 5: Policies ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  // Click "Use the recommended answers"
  await driver.eval(`(() => {
    const btn = document.querySelector('.onb-policy-defaults');
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 6: Responsibility
  console.log('--- Stage 6: Responsibility ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 7: Structure
  console.log('--- Stage 7: Structure ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  // Configure Branch 0
  const branchCount = await driver.eval(`document.querySelectorAll('[id^="branch-name-"]').length`);
  if (branchCount === 0) {
    await driver.clickText('Add a branch', 'button');
    await new Promise(r => setTimeout(r, 300));
  }
  await driver.fill('#branch-name-0', 'Main Service Center');
  await driver.fill('#branch-code-0', 'PMC-MAIN');
  await driver.fill('#branch-city-0', 'Cairo');

  // Add Branch 1
  await driver.clickText('Add a branch', 'button');
  await new Promise(r => setTimeout(r, 300));
  await driver.fill('#branch-name-1', 'Express Service Branch');
  await driver.fill('#branch-code-1', 'PMC-EXP');
  await driver.fill('#branch-city-1', 'New Cairo');

  // Warehouses
  let whCount = await driver.eval(`document.querySelectorAll('[id^="wh-name-"]').length`);
  while (whCount < 3) {
    await driver.clickText('Add a store', 'button');
    await new Promise(r => setTimeout(r, 300));
    whCount = await driver.eval(`document.querySelectorAll('[id^="wh-name-"]').length`);
  }
  await driver.fill('#wh-name-0', 'Central Parts Warehouse');
  await driver.fill('#wh-code-0', 'PMC-CEN');
  await driver.fill('#wh-name-1', 'Fast Moving Parts Store');
  await driver.fill('#wh-code-1', 'PMC-FST');
  await driver.fill('#wh-name-2', 'Fluids & Consumables Store');
  await driver.fill('#wh-code-2', 'PMC-FLD');

  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 8: Services
  console.log('--- Stage 8: Services ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  
  const services = [
    { name: 'Comprehensive Scheduled Service', price: '750' },
    { name: 'Advanced Diagnostic Scan', price: '350' },
    { name: 'Brake System Overhaul', price: '550' },
    { name: 'Transmission Fluid Flush', price: '420' }
  ];

  for (let i = 0; i < services.length; i++) {
    const curCount = await driver.eval(`document.querySelectorAll('[id^="svc-name-"]').length`);
    if (i >= curCount) {
      await driver.clickText('Add a service', 'button');
      await new Promise(r => setTimeout(r, 300));
    }
    await driver.fill(`#svc-name-${i}`, services[i].name);
    await driver.fill(`#svc-price-${i}`, services[i].price);
  }

  await new Promise(r => setTimeout(r, 500));
  await driver.clickText('Continue', 'button');
  await new Promise(r => setTimeout(r, 1000));

  // Stage 9: Review
  console.log('--- Stage 9: Review ---');
  console.log('Heading:', await driver.eval(`document.querySelector('.onb-stage-title')?.innerText`));
  const publishable = await driver.eval(`!document.querySelector('button[variant="primary"], button.mop-btn--primary')?.disabled`);
  console.log('Is Create button enabled?', publishable);

  const findings = await driver.eval(`Array.from(document.querySelectorAll('.onb-finding')).map(e => e.innerText)`);
  if (findings.length > 0) {
    console.log('Findings on review screen:', findings);
  }

  // Click "Create this workshop"
  await driver.clickText('Create this workshop', 'button');
  console.log('Clicked Create this workshop, awaiting completion...');
  await new Promise(r => setTimeout(r, 4000));

  // Check captured requests or UI for inviteLink
  const captured = await driver.eval(`window.__mop_captured`);
  console.log('Captured API responses count:', captured?.length);
  const publishRes = captured?.find(c => c.url?.includes('/onboarding') || c.data?.inviteLink);
  console.log('Publish result:', publishRes?.data);

  // Take screenshot of confirmation
  await driver.screenshot('C:\\Users\\ahmed\\Desktop\\workshop_a_created.png');
  console.log('Screenshot saved to workshop_a_created.png');

  driver.close();
}

main().catch(err => {
  console.error('Failure in simulation:', err);
  process.exit(1);
});
