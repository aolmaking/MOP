import { BrowserDriver } from './browser-driver.mjs';

const WORKSHOPS_TO_CREATE = [
  {
    name: 'Apex EV & High Voltage Lab',
    slug: 'apex-ev-lab',
    city: 'Cairo',
    palette: 'cobalt', // Cyber Cobalt
    category: 'Cars',
    logoUrl: 'https://images.unsplash.com/photo-1558441719-8b4bee5ad7d6?w=128&auto=format&fit=crop&q=80',
    ownerName: 'Tarek Mansour',
    ownerEmail: 'owner@apex-ev-lab.local',
    ownerPhone: '+201001234567',
    ownerPassword: 'ChangeMe-Apex-123',
    branches: [
      { name: 'Apex EV Hub New Cairo', code: 'APEX-01', city: 'Cairo' }
    ],
    warehouses: [
      { name: 'High Voltage Spares Vault', code: 'WH-APEX' }
    ],
    services: [
      { name: 'EV Battery Diagnostics', price: '250000' },
      { name: 'Inverter & Power Electronics Overhaul', price: '180000' }
    ],
    staff: [
      {
        fullName: 'Nader Samir',
        role: 'BRANCH_MANAGER',
        email: 'manager@apex-ev-lab.local',
        phone: '+201011112222',
        password: 'Password-EV-Manager-123'
      },
      {
        fullName: 'Ziad Khalil',
        role: 'TECHNICIAN',
        email: 'tech.hv@apex-ev-lab.local',
        phone: '+201033334444',
        password: 'Password-EV-Tech-123'
      },
      {
        fullName: 'Sherif Fawzy',
        role: 'INVENTORY_MANAGER',
        email: 'parts@apex-ev-lab.local',
        phone: '+201055556666',
        password: 'Password-EV-Parts-123'
      }
    ]
  },
  {
    name: 'Titan Diesel & Heavy Fleet Hub',
    slug: 'titan-diesel-hub',
    city: 'Alexandria',
    palette: 'amber', // Electric Amber
    category: 'Cars',
    logoUrl: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=128&auto=format&fit=crop&q=80',
    ownerName: 'Hossam El-Din',
    ownerEmail: 'owner@titan-diesel-hub.local',
    ownerPhone: '+201229876543',
    ownerPassword: 'ChangeMe-Titan-123',
    branches: [
      { name: 'Titan Maritime Port Station', code: 'TITAN-01', city: 'Alexandria' }
    ],
    warehouses: [
      { name: 'Heavy Spares & Pneumatic Depot', code: 'WH-TITAN' }
    ],
    services: [
      { name: 'Heavy Fleet Overhaul Inspection', price: '450000' },
      { name: 'Pneumatic Brake & Compressor Rebuild', price: '320000' }
    ],
    staff: [
      {
        fullName: 'Ibrahim Galal',
        role: 'BRANCH_MANAGER',
        email: 'manager@titan-diesel-hub.local',
        phone: '+201211112222',
        password: 'Password-Titan-Mgr-123'
      },
      {
        fullName: 'Mahmoud Rady',
        role: 'TECHNICIAN',
        email: 'tech.diesel@titan-diesel-hub.local',
        phone: '+201233334444',
        password: 'Password-Titan-Tech-123'
      },
      {
        fullName: 'Sameh Bakr',
        role: 'INVENTORY_MANAGER',
        email: 'parts@titan-diesel-hub.local',
        phone: '+201255556666',
        password: 'Password-Titan-Parts-123'
      }
    ]
  },
  {
    name: 'Royale Bespoke & Exotic Studio',
    slug: 'royale-exotic-studio',
    city: 'Giza',
    palette: 'violet', // Royal Violet
    category: 'Cars',
    logoUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=128&auto=format&fit=crop&q=80',
    ownerName: 'Karim Farouk',
    ownerEmail: 'owner@royale-exotic-studio.local',
    ownerPhone: '+201115554321',
    ownerPassword: 'ChangeMe-Royale-123',
    branches: [
      { name: 'Royale Atelier Pyramids', code: 'ROYALE-01', city: 'Giza' }
    ],
    warehouses: [
      { name: 'Carbon & Titanium Components Store', code: 'WH-ROYALE' }
    ],
    services: [
      { name: 'Stage 2 Custom ECU Dyno Calibration', price: '800000' },
      { name: 'Carbon Ceramic Brake Bedding', price: '550000' }
    ],
    staff: [
      {
        fullName: 'Youssef Ezzat',
        role: 'BRANCH_MANAGER',
        email: 'manager@royale-exotic-studio.local',
        phone: '+201122223333',
        password: 'Password-Royale-Mgr-123'
      },
      {
        fullName: 'Amr Hegazy',
        role: 'TECHNICIAN',
        email: 'tech.exotic@royale-exotic-studio.local',
        phone: '+201144445555',
        password: 'Password-Royale-Tech-123'
      },
      {
        fullName: 'Hazem Nour',
        role: 'INVENTORY_MANAGER',
        email: 'parts@royale-exotic-studio.local',
        phone: '+201166667777',
        password: 'Password-Royale-Parts-123'
      }
    ]
  }
];

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Connected to Chrome CDP on 9222');

  const results = [];

  for (const ws of WORKSHOPS_TO_CREATE) {
    console.log(`\n========================================`);
    console.log(`Creating Workshop via UI: ${ws.name}`);
    console.log(`========================================`);

    // Step 1: Login as Platform Admin
    await driver.clearCookies();
    await driver.navigate('http://localhost:4200/login');
    await driver.waitForSelector('.text-link-btn, #workshopCode', 12000);

    // Direct platform login link
    await driver.clickText('Platform Administrator? Sign in directly', 'button');
    await driver.waitForSelector('#email', 10000);

    await driver.fill('#email', 'platform-admin@mop.local');
    await driver.fill('#password', 'ChangeMe-Platform-123');
    await driver.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Navigate to Onboarding
    await driver.navigate('http://localhost:4200/platform/workshops/new');
    await driver.waitForSelector('#ws-name', 15000);

    // Stage 1: Identity
    console.log('--- Stage 1: Identity ---');
    await driver.fill('#ws-name', ws.name);
    await driver.fill('#ws-slug', ws.slug);

    // Country
    await driver.fill('#ws-country', 'Egypt');
    await driver.waitForSelector('.onb-country-option', 8000);
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

    // Logo URL
    if (ws.logoUrl) {
      await driver.fill('#ws-logo', ws.logoUrl);
    }

    // Theme Palette selection
    if (ws.palette) {
      await driver.eval(`(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const palBtn = buttons.find(b => b.innerText.toLowerCase().includes(${JSON.stringify(ws.palette.toLowerCase())}));
        if (palBtn) palBtn.click();
      })()`);
    }
    await new Promise(r => setTimeout(r, 500));

    await driver.clickText('Continue', 'button');

    // Stage 2: Plan
    console.log('--- Stage 2: Plan ---');
    await driver.waitForSelector('#owner-name', 12000);
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

    // Stage 3: Capabilities
    console.log('--- Stage 3: Capabilities ---');
    await driver.waitForSelector('.onb-shape', 12000);
    await driver.eval(`(() => {
      const shapes = Array.from(document.querySelectorAll('.onb-shape'));
      const full = shapes.find(s => s.innerText.includes('Full-service')) || shapes[0];
      if (full) full.click();
    })()`);
    await new Promise(r => setTimeout(r, 500));
    await driver.clickText('Continue', 'button');

    // Stage 4: Specialization
    console.log('--- Stage 4: Specialization ---');
    await new Promise(r => setTimeout(r, 800));
    await driver.clickText('Continue', 'button');

    // Stage 5: Policies
    console.log('--- Stage 5: Policies ---');
    await driver.waitForSelector('.onb-policy-defaults', 12000);
    await driver.eval(`(() => {
      const btn = document.querySelector('.onb-policy-defaults');
      if (btn) btn.click();
    })()`);
    await new Promise(r => setTimeout(r, 500));
    await driver.clickText('Continue', 'button');

    // Stage 6: Responsibility
    console.log('--- Stage 6: Responsibility ---');
    await new Promise(r => setTimeout(r, 800));
    await driver.clickText('Continue', 'button');

    // Stage 7: Structure
    console.log('--- Stage 7: Structure ---');
    await driver.waitForSelector('.onb-add', 12000);
    for (let i = 0; i < ws.branches.length; i++) {
      const curCount = await driver.eval(`document.querySelectorAll('[id^="branch-name-"]').length`);
      if (i >= curCount) {
        await driver.clickText('Add a branch', 'button');
        await driver.waitForSelector(`#branch-name-${i}`, 6000);
      }
      await driver.fill(`#branch-name-${i}`, ws.branches[i].name);
      await driver.fill(`#branch-code-${i}`, ws.branches[i].code);
      await driver.fill(`#branch-city-${i}`, ws.branches[i].city);
    }

    for (let i = 0; i < ws.warehouses.length; i++) {
      const curCount = await driver.eval(`document.querySelectorAll('[id^="wh-name-"]').length`);
      if (i >= curCount) {
        await driver.clickText('Add a store', 'button');
        await driver.waitForSelector(`#wh-name-${i}`, 6000);
      }
      await driver.fill(`#wh-name-${i}`, ws.warehouses[i].name);
      await driver.fill(`#wh-code-${i}`, ws.warehouses[i].code);
    }

    await new Promise(r => setTimeout(r, 500));
    await driver.clickText('Continue', 'button');

    // Stage 8: Services
    console.log('--- Stage 8: Services ---');
    await driver.waitForSelector('.onb-add', 12000);
    for (let i = 0; i < ws.services.length; i++) {
      const curCount = await driver.eval(`document.querySelectorAll('[id^="svc-name-"]').length`);
      if (i >= curCount) {
        await driver.clickText('Add a service', 'button');
        await driver.waitForSelector(`#svc-name-${i}`, 6000);
      }
      await driver.fill(`#svc-name-${i}`, ws.services[i].name);
      await driver.fill(`#svc-price-${i}`, ws.services[i].price);
    }

    await new Promise(r => setTimeout(r, 500));
    await driver.clickText('Continue', 'button');

    // Stage 9: Review & Publish
    console.log('--- Stage 9: Review ---');
    await driver.waitForText('Create this workshop', 'button', 15000);
    await driver.clickText('Create this workshop', 'button');
    console.log('Clicked Create this workshop, awaiting completion...');
    await driver.waitForSelector('.onb-publish-actions, .onb-invite-link', 25000);

    // Capture publish response and invite link
    const captured = await driver.eval(`window.__mop_captured`);
    const pub = captured?.reverse().find(c => c.url?.includes('/platform/workshops') && c.data?.ownerInvitation?.link);
    let ownerInviteLink = pub?.data?.ownerInvitation?.link;
    let tenantId = pub?.data?.tenant?.id;
    let customerRegistrationCode = pub?.data?.tenant?.customerRegistrationCode;

    if (!ownerInviteLink || !customerRegistrationCode) {
      const domLinks = await driver.eval(`Array.from(document.querySelectorAll('.onb-invite-link')).map(e => e.innerText.trim())`);
      console.log('DOM extracted links/codes:', domLinks);
      if (Array.isArray(domLinks)) {
        for (const item of domLinks) {
          if (item.includes('/invite/')) ownerInviteLink = item;
          else if (item.length >= 6 && item.length <= 16 && !item.includes('/')) customerRegistrationCode = item;
        }
      }
    }

    console.log(`Created Workshop: ${ws.name}`);
    console.log(`Tenant ID: ${tenantId}`);
    console.log(`Registration Code: ${customerRegistrationCode}`);
    console.log(`Owner Invite Link: ${ownerInviteLink}`);

    // Step 3: Accept Owner Invite
    if (ownerInviteLink) {
      console.log(`Setting password for Owner (${ws.ownerEmail})...`);
      await driver.navigate(`http://localhost:4200${ownerInviteLink}`);
      await driver.waitForSelector('input[type="password"]', 12000);

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
      await driver.waitForText('Set password', 'button', 10000);
      await driver.clickText('Set password', 'button');
      await new Promise(r => setTimeout(r, 2000));
      console.log(`Owner password set!`);
    }

    // Step 4: Login as Owner via 2-Step Login
    console.log(`Logging in as Owner via 2-Step Login...`);
    await driver.clearCookies();
    await driver.navigate('http://localhost:4200/login');
    await driver.waitForSelector('#workshopCode', 12000);

    // Step 1: Workshop Code
    if (customerRegistrationCode) {
      await driver.fill('#workshopCode', customerRegistrationCode);
      await driver.click('.continue-btn');
      await driver.waitForSelector('#email', 10000);
    }

    // Step 2: Credentials
    await driver.fill('#email', ws.ownerEmail);
    await driver.fill('#password', ws.ownerPassword);
    await driver.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2500));

    console.log(`Owner logged in! Current URL:`, await driver.getUrl());

    // Step 5: Navigate to /owner/organization and create workers
    await driver.navigate('http://localhost:4200/owner/organization');
    await driver.waitForSelector('button', 12000);
    await new Promise(r => setTimeout(r, 1200));

    for (const member of ws.staff) {
      console.log(`Provisioning worker through Owner UI: ${member.fullName} (${member.role})...`);
      await driver.clickText('+ Invite Staff', 'button');
      await driver.waitForSelector('.modal', 8000);
      await new Promise(r => setTimeout(r, 500));

      // Ensure Direct Account mode
      await driver.eval(`(() => {
        const buttons = Array.from(document.querySelectorAll('.modal button'));
        const directBtn = buttons.find(b => b.innerText.includes('Direct Account'));
        if (directBtn) directBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 300));

      // Fill Name, Email, Phone
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const inputs = modal.querySelectorAll('input');
        // fullName
        inputs[0].value = ${JSON.stringify(member.fullName)};
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

        // email
        inputs[1].value = ${JSON.stringify(member.email)};
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

        // phone
        inputs[2].value = ${JSON.stringify(member.phone)};
        inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
      })()`);

      // Password
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const pwdInput = modal.querySelector('input[type="password"]');
        if (pwdInput) {
          pwdInput.value = ${JSON.stringify(member.password)};
          pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
          pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);

      // Role
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const select = modal.querySelector('select');
        if (select) {
          const opt = Array.from(select.options).find(o => o.value === ${JSON.stringify(member.role)});
          if (opt) {
            select.selectedIndex = opt.index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      })()`);
      await new Promise(r => setTimeout(r, 400));

      // Select branch scope or warehouse scope if applicable
      await driver.eval(`(() => {
        const bSel = document.querySelector('#staff-branch-scope');
        if (bSel && bSel.tagName === 'SELECT' && bSel.options.length > 0) {
          bSel.selectedIndex = 0;
          bSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const wSel = document.querySelector('#staff-wh-scope');
        if (wSel && wSel.tagName === 'SELECT' && wSel.options.length > 0) {
          wSel.selectedIndex = 0;
          wSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 400));

      // Submit
      await driver.clickText('Create Active Worker Account', 'button');
      await new Promise(r => setTimeout(r, 2000));
      console.log(`Worker ${member.fullName} created successfully via Owner UI!`);
    }

    results.push({
      workshopName: ws.name,
      slug: ws.slug,
      code: customerRegistrationCode,
      palette: ws.palette,
      ownerEmail: ws.ownerEmail,
      ownerPassword: ws.ownerPassword,
      staff: ws.staff
    });
  }

  console.log('\n========================================');
  console.log('ALL WORKSHOPS AND WORKERS CREATED THROUGH PROGRAM UI!');
  console.log('========================================');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
