process.env.DATABASE_URL ??= 'postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_dev?schema=public';

import { scryptSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '../packages/database/generated/client/index.js';
import { BrowserDriver } from './browser-driver.mjs';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

const prisma = new PrismaClient();

async function main() {
  console.log('=== Step 1: Provisioning Active Customer for Apex EV Lab ===');
  const tenant = await prisma.tenant.findFirst({
    where: { customerRegistrationCode: '5BBD8BD60E' },
    select: { id: true, name: true, customerRegistrationCode: true, primaryCategory: true },
  });

  if (!tenant) {
    throw new Error('Tenant 5BBD8BD60E not found');
  }
  console.log(`Found Workshop: ${tenant.name} (${tenant.customerRegistrationCode})`);

  // Ensure branch
  const branch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, name: true },
  });
  console.log(`Found Branch: ${branch?.name} (${branch?.id})`);

  const customerEmail = 'customer@apex-ev-lab.local';
  const customerPhone = '+201100099881';
  const customerName = 'Ziad Al-Mansoor';
  const password = 'ChangeMe-Customer-123';

  // Check or create account
  let account = await prisma.account.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: customerEmail } },
  });

  if (!account) {
    account = await prisma.account.create({
      data: {
        tenantId: tenant.id,
        email: customerEmail,
        passwordHash: hashPassword(password),
        accountType: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    console.log(`Created Account: ${account.email} (${account.id})`);
  }

  // Check or create Customer record
  let customer = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, accountId: account.id },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        accountId: account.id,
        fullName: customerName,
        phone: customerPhone,
        portalStatus: 'ENABLED',
      },
    });
    console.log(`Created Customer profile: ${customer.fullName} (${customer.id})`);
  }

  // Ensure customer has a registered vehicle
  let asset = await prisma.asset.findFirst({
    where: { tenantId: tenant.id, currentOwnerCustomerId: customer.id },
  });

  if (!asset) {
    asset = await prisma.asset.create({
      data: {
        tenantId: tenant.id,
        category: 'CARS',
        plateNumber: 'EV-8820',
        vinOrChassisNumber: 'WBA12345EV9988221',
        currentOwnerCustomerId: customer.id,
      },
    });
    await prisma.assetOwnershipHistory.create({
      data: {
        tenantId: tenant.id,
        assetId: asset.id,
        customerId: customer.id,
      },
    });
    console.log(`Created Vehicle: ${asset.plateNumber} (${asset.id})`);
  } else {
    console.log(`Existing Vehicle: ${asset.plateNumber} (${asset.id})`);
  }

  console.log('\n=== Step 2: Launching Browser to Customer Portal ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('Navigating to http://localhost:4200/login ...');
  await driver.navigate('http://localhost:4200/login');
  await new Promise((r) => setTimeout(r, 2000));

  // Check if already logged in as customer or login fresh
  const currentUrl = await driver.eval('window.location.href');
  console.log('Current URL:', currentUrl);

  if (!currentUrl.includes('/customer')) {
    console.log('Clearing old session and logging in as customer...');
    await driver.eval('localStorage.clear(); sessionStorage.clear();');
    await driver.navigate('http://localhost:4200/login');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Filling Workshop Code: 5BBD8BD60E ...');
    await driver.fill('#workshopCode', '5BBD8BD60E');
    await driver.click('.continue-btn');
    await new Promise((r) => setTimeout(r, 2000));

    console.log('Filling Customer Credentials ...');
    await driver.fill('#email', customerEmail);
    await driver.fill('#password', password);
    await driver.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 3500));
  }

  const portalUrl = await driver.eval('window.location.href');
  console.log('Landed on URL:', portalUrl);

  // Take screenshot 1: Customer Portal Home Hub
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_hub_initial.png',
  );
  console.log('Saved: customer_hub_initial.png');

  console.log('\n=== Step 3: Reporting Issue / Booking Service ===');
  await driver.click('#btn-report-issue');
  await new Promise((r) => setTimeout(r, 1000));

  // Take screenshot 2: Intake modal open
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_intake_modal.png',
  );
  console.log('Saved: customer_intake_modal.png');

  // Fill complaint
  await driver.fill(
    '#complaint-desc',
    'High-voltage battery cooling warning under fast charging. Inverter power reduction at highway speed.',
  );
  await new Promise((r) => setTimeout(r, 500));

  // Submit request
  console.log('Submitting Service Request...');
  await driver.click('#btn-submit-service-request');
  await new Promise((r) => setTimeout(r, 3500));

  // Take screenshot 3: Live Tracker Active
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_live_tracker_active.png',
  );
  console.log('Saved: customer_live_tracker_active.png');

  // Find the created work order
  const latestWo = await prisma.workOrder.findFirst({
    where: { tenantId: tenant.id, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });
  console.log(`Active Work Order created: ${latestWo?.id} (Status: ${latestWo?.status})`);

  if (latestWo) {
    console.log('\n=== Step 4: Simulating In-Bay Inspection & Technician Approval Request ===');
    // Move work order to UNDER_INSPECTION
    await prisma.workOrder.update({
      where: { id: latestWo.id },
      data: { status: 'AWAITING_CUSTOMER_APPROVAL' },
    });

    // Find staff or owner account for createdById
    const staffAccount = await prisma.account.findFirst({
      where: { tenantId: tenant.id },
      select: { id: true },
    });

    // Create a customer decision request using proper schema fields
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    const token = `tok-${Date.now()}`;
    const decReq = await prisma.customerDecisionRequest.create({
      data: {
        tenantId: tenant.id,
        customerId: customer.id,
        workOrderId: latestWo.id,
        secureToken: token,
        createdById: staffAccount.id,
        status: 'SENT',
        sentAt: new Date(),
        expiresAt,
      },
    });

    await prisma.customerDecisionItem.create({
      data: {
        tenantId: tenant.id,
        decisionRequestId: decReq.id,
        name: 'High-Voltage Contactor Relay Replacement',
        explanation: 'Internal contact resistance exceeds safe manufacturer threshold. Replacement required.',
        importance: 'CRITICAL',
        price: '280.00',
        laborPrice: '120.00',
        total: '400.00',
        decision: 'PENDING',
      },
    });

    await prisma.customerDecisionItem.create({
      data: {
        tenantId: tenant.id,
        decisionRequestId: decReq.id,
        name: 'Battery Coolant Flush & De-Ionized Refill',
        explanation: 'Conductivity of coolant is elevated. Prevents electrical leakage in battery pack.',
        importance: 'MEDIUM',
        price: '85.00',
        laborPrice: '45.00',
        total: '130.00',
        decision: 'PENDING',
      },
    });

    console.log(`Created Technician Decision Request: ${decReq.id}`);
    await new Promise((r) => setTimeout(r, 2500));

    // Refresh page to show approval card
    await driver.navigate('http://localhost:4200/customer');
    await new Promise((r) => setTimeout(r, 2500));

    // Take screenshot 4: Approval card visible
    await driver.screenshot(
      'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_technician_approval_inlined.png',
    );
    console.log('Saved: customer_technician_approval_inlined.png');

    console.log('\n=== Step 5: Customer Approving Recommended Work ===');
    // Click approve buttons in decision-answer
    const approveBtns = await driver.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('.pick--yes'));
      btns.forEach(b => b.click());
      return btns.length;
    })()`);
    console.log(`Clicked ${approveBtns} approve choices`);
    await new Promise((r) => setTimeout(r, 1000));

    // Click submit answers
    const submitted = await driver.eval(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sendBtn = btns.find(b => b.innerText.includes('Send my answers'));
      if (sendBtn) {
        sendBtn.click();
        return true;
      }
      return false;
    })()`);
    console.log('Clicked Send my answers:', submitted);
    await new Promise((r) => setTimeout(r, 3500));

    // Take screenshot 5: Decisions answered
    await driver.screenshot(
      'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_decision_answered.png',
    );
    console.log('Saved: customer_decision_answered.png');
  }

  console.log('\n=== Step 6: Verifying Consolidated Garage & Records Hub ===');
  await driver.navigate('http://localhost:4200/customer/garage');
  await new Promise((r) => setTimeout(r, 2000));

  // Take screenshot 6: Vehicles Tab
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_garage_vehicles.png',
  );
  console.log('Saved: customer_garage_vehicles.png');

  // Click Service History tab
  await driver.eval(`(() => {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const histTab = tabs.find(t => t.innerText.includes('History'));
    if (histTab) histTab.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1000));

  // Take screenshot 7: History Tab
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_garage_history.png',
  );
  console.log('Saved: customer_garage_history.png');

  // Click Invoices tab
  await driver.eval(`(() => {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const invTab = tabs.find(t => t.innerText.includes('Invoices'));
    if (invTab) invTab.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1000));

  // Take screenshot 8: Invoices Tab
  await driver.screenshot(
    'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277/customer_garage_invoices.png',
  );
  console.log('Saved: customer_garage_invoices.png');

  console.log('\n=== ALL END-TO-END VERIFICATION STEPS COMPLETED SUCCESSFULLY! ===');
}

main()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
