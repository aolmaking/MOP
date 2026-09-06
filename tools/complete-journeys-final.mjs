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

async function run() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  try {
    console.log('==================================================');
    console.log('COMPLETING FINAL JOURNEY STEPS ACROSS WORKSHOPS');
    console.log('==================================================');

    // -------------------------------------------------------------------------
    // 1. WORKSHOP A: Record verbal approval for BMW 330i (PMC-702-EGY) & start work
    // -------------------------------------------------------------------------
    console.log('\n--- Workshop A: Recording Approval for BMW 330i ---');
    await loginUser(driver, 'manager@precision-motors.local', 'ChangeMe-Staff-123');

    const a2Res = await driver.eval(`(async () => {
      const approvalsRes = await fetch('/api/v1/branch-manager/approvals');
      const approvals = await approvalsRes.json();
      const allRows = [...(approvals.waiting || []), ...(approvals.unsent || [])];
      const match = allRows.find(r => r.identifier?.includes('PMC-702-EGY'));
      if (!match) return { error: 'No approval row for PMC-702-EGY' };

      const detailRes = await fetch('/api/v1/branch-manager/approvals/' + match.requestId);
      const detail = await detailRes.json();

      const answers = detail.items.map(i => ({ itemId: i.id, decision: 'APPROVED' }));
      const recRes = await fetch('/api/v1/branch-manager/approvals/' + match.requestId + '/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          evidenceReference: 'Customer Dr. Sherif Nour confirmed approval by telephone at 11:30 AM'
        })
      });
      return { status: recRes.status, workOrderId: match.workOrderId };
    })()`);
    console.log('BMW 330i approval record result:', a2Res);

    if (a2Res.workOrderId) {
      // Tech Ziad starts work -> IN_PROGRESS
      await loginUser(driver, 'tech.ziad@precision-motors.local', 'ChangeMe-Staff-123');
      const startRes = await driver.eval(`(async () => {
        const res = await fetch('/api/v1/technician/work-orders/${a2Res.workOrderId}/start-work', { method: 'POST' });
        return { status: res.status, body: await res.json() };
      })()`);
      console.log('BMW 330i start work result:', startRes);
    }

    // -------------------------------------------------------------------------
    // 2. WORKSHOP A: Settle payment and deliver PMC-701-EGY (Journey A -> CLOSED)
    // -------------------------------------------------------------------------
    console.log('\n--- Workshop A: Settling Invoice & Delivering PMC-701-EGY ---');
    await loginUser(driver, 'owner@precision-motors.local', 'ChangeMe-Staff-123');

    const a1DeliverRes = await driver.eval(`(async () => {
      // Find PMC-701-EGY workOrderId
      const boardRes = await fetch('/api/v1/branch-manager/work-orders?includeFinished=true&q=PMC-701-EGY');
      const board = await boardRes.json();
      let woId = null;
      for (const lane of (board.lanes || [])) {
        const match = lane.rows?.find(r => r.identifier?.includes('PMC-701-EGY'));
        if (match) woId = match.id;
      }
      if (!woId) return { error: 'PMC-701-EGY not found' };

      // Issue invoice
      let invoice = null;
      const invRes = await fetch('/api/v1/finance/work-orders/' + woId + '/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountPercent: 0, taxPercent: 14 })
      });
      if (invRes.ok) {
        invoice = await invRes.json();
      }

      // Record payment
      if (invoice?.id) {
        await fetch('/api/v1/finance/invoices/' + invoice.id + '/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: invoice.total,
            method: 'CARD',
            idempotencyKey: 'pay-pmc701-' + Date.now()
          })
        });
      }

      // Now deliver work order
      const delRes = await fetch('/api/v1/branch-manager/work-orders/' + woId + '/deliver', { method: 'POST' });
      return { woId, deliverStatus: delRes.status };
    })()`);
    console.log('PMC-701-EGY delivery outcome:', a1DeliverRes);

    // -------------------------------------------------------------------------
    // 3. WORKSHOP B: Record rejection for 1974 Alfa Romeo Spider (HAR-1974-VNT)
    // -------------------------------------------------------------------------
    console.log('\n--- Workshop B: Recording Customer Rejection for Alfa Romeo ---');
    await loginUser(driver, 'manager@heritage-restoration.local', 'ChangeMe-Staff-123');

    const b1Res = await driver.eval(`(async () => {
      const approvalsRes = await fetch('/api/v1/branch-manager/approvals');
      const approvals = await approvalsRes.json();
      const allRows = [...(approvals.waiting || []), ...(approvals.unsent || [])];
      const match = allRows.find(r => r.identifier?.includes('HAR-1974-VNT'));
      if (!match) return { error: 'No approval row for HAR-1974-VNT' };

      const detailRes = await fetch('/api/v1/branch-manager/approvals/' + match.requestId);
      const detail = await detailRes.json();

      const answers = detail.items.map(i => ({
        itemId: i.id,
        decision: 'REJECTED',
        warningAcknowledged: true,
        note: 'Customer declined quote due to high restoration cost'
      }));

      const recRes = await fetch('/api/v1/branch-manager/approvals/' + match.requestId + '/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          evidenceReference: 'Customer Hisham El-Gammal declined quote in person'
        })
      });
      return { status: recRes.status, workOrderId: match.workOrderId };
    })()`);
    console.log('Alfa Romeo rejection record result:', b1Res);

    // -------------------------------------------------------------------------
    // 4. WORKSHOP C: Settle payment for Ford Transit (RFC-901-FLT) -> READY_FOR_DELIVERY
    // -------------------------------------------------------------------------
    console.log('\n--- Workshop C: Settling Payment for Ford Transit ---');
    await loginUser(driver, 'owner@rapid-fleet.local', 'ChangeMe-Staff-123');

    const c1Res = await driver.eval(`(async () => {
      const boardRes = await fetch('/api/v1/branch-manager/work-orders?includeFinished=true&q=RFC-901-FLT');
      const board = await boardRes.json();
      let woId = null;
      for (const lane of (board.lanes || [])) {
        const match = lane.rows?.find(r => r.identifier?.includes('RFC-901-FLT'));
        if (match) woId = match.id;
      }
      if (!woId) return { error: 'RFC-901-FLT not found' };

      // Issue invoice
      let invoice = null;
      const invRes = await fetch('/api/v1/finance/work-orders/' + woId + '/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountPercent: 0, taxPercent: 14 })
      });
      if (invRes.ok) {
        invoice = await invRes.json();
      }

      // Record payment to transition to READY_FOR_DELIVERY
      let payStatus = null;
      if (invoice?.id) {
        const payRes = await fetch('/api/v1/finance/invoices/' + invoice.id + '/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: invoice.total,
            method: 'CASH',
            idempotencyKey: 'pay-rfc901-' + Date.now()
          })
        });
        payStatus = payRes.status;
      }

      // Check current status
      const woRes = await fetch('/api/v1/branch-manager/work-orders/' + woId);
      const wo = await woRes.json();
      return { woId, status: wo.status, payStatus };
    })()`);
    console.log('Ford Transit status outcome:', c1Res);

    console.log('\n==================================================');
    console.log('FINAL JOURNEY COMPLETIONS COMPLETE');
    console.log('==================================================');
  } catch (err) {
    console.error('Error during final journey completion:', err);
  } finally {
    await driver.close();
  }
}

run();
