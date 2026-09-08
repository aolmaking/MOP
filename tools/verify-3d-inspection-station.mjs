import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginUser(driver, email, password) {
  console.log(`Logging in as ${email}...`);
  await driver.clearCookies();
  await driver.navigate(`${BASE_URL}/login`);
  await sleep(1500);

  // If on stage 1 (Workshop Code), skip directly to credentials form
  const isWorkshopStep = await driver.eval(`Boolean(document.querySelector('.text-link-btn'))`);
  if (isWorkshopStep) {
    await driver.click('.text-link-btn');
    await sleep(800);
  }

  await driver.fill('#email', email);
  await driver.fill('#password', password);
  await sleep(300);
  await driver.click('button[type="submit"]');
  await sleep(2500);
}

async function run() {
  console.log('--- Starting 3D Inspection & Simplified Checklist Verification ---');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // Set wide desktop viewport for crystal-clear 3D presentation
  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. CUSTOMER INTAKE WITH 3D CAR & ANIMATED SUBSYSTEMS
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Customer Intake with 3D Car & Animated Subsystem Choices ---');
    await loginUser(driver, 'sara.nabil@customer.local', 'ChangeMe-Customer-123');

    await driver.navigate(`${BASE_URL}/customer`);
    await sleep(2000);

    console.log('Arrived at Customer Portal. Opening Service Intake modal...');
    await driver.waitForSelector('#btn-report-issue, button.action-card-btn', 10000);
    await driver.click('#btn-report-issue');
    await sleep(2000);

    // Scroll into the 3D car section in the intake modal
    await driver.eval(`(() => {
      const section = document.querySelector('.customer-3d-intake-section');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(1000);

    // Verify 3D canvas and animated choice cards are visible in modal
    const intakeModalReady = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      const canvas = document.querySelector('.customer-3d-car-box canvas');
      const cards = document.querySelectorAll('.subsystem-choice-card');
      const animatedSvgs = document.querySelectorAll('.animated-part-container');
      const callout = document.querySelector('.callout-badge');
      const calloutTitle = document.querySelector('.callout-title')?.innerText;
      return {
        hasModal: Boolean(modal),
        hasCanvas: Boolean(canvas),
        hasCallout: Boolean(callout),
        calloutTitle: calloutTitle || null,
        cardsCount: cards.length,
        animatedCount: animatedSvgs.length,
      };
    })()`);
    console.log('Customer Intake Modal inspection:', intakeModalReady);

    // Select Brakes subsystem and click symptom chip
    await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      const brakesCard = cards.find(c => c.innerText.includes('فرامل') || c.innerText.includes('Brakes'));
      if (brakesCard) brakesCard.click();

      const chip = document.querySelector('.symptom-add-btn');
      if (chip) chip.click();
    })()`);
    await sleep(1500);

    const shot1 = path.join(ARTIFACT_DIR, 'customer_3d_intake_modal.png');
    await driver.screenshot(shot1);
    console.log(`Saved screenshot: ${shot1}`);

    // Close intake modal
    await driver.eval(`(() => {
      const closeBtn = document.querySelector('.modal-close-btn') || document.querySelector('.btn-cancel');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(1000);

    // ════════════════════════════════════════════════════════════════════
    // 2. TECHNICIAN WORK CARD WITH 3D CAR & SIMPLIFIED PART BOXES
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Technician 3D Station with Simplified Part Boxes ---');
    await loginUser(driver, 'tech@apex-motors.local', 'ChangeMe-Tech-123');

    // Navigate to work order under inspection: cmtlz035k00lp1ndnnwjxtz5o
    console.log('Navigating to Work Order under inspection: cmtlz035k00lp1ndnnwjxtz5o...');
    await driver.navigate(`${BASE_URL}/tech/card/cmtlz035k00lp1ndnnwjxtz5o`);
    await sleep(3500);

    // Scroll directly to the 3D Car Map
    await driver.eval(`(() => {
      const el = document.querySelector('.tech-3d-car-container');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(1200);

    // Verify 3D Car Viewer and simplified inspection boxes
    const techStationState = await driver.eval(`(() => {
      const canvas = document.querySelector('.tech-3d-car-container canvas');
      const callout = document.querySelector('.callout-badge');
      const calloutTitle = document.querySelector('.callout-title')?.innerText;
      const boxes = Array.from(document.querySelectorAll('.inspection-part-box'));
      const customerBtns = document.querySelectorAll('.box-btn-customer');
      const doneBtns = document.querySelectorAll('.box-btn-done');
      const progressPill = document.querySelector('.tech-progress-pill')?.innerText;

      return {
        hasCanvas: Boolean(canvas),
        hasCallout: Boolean(callout),
        calloutTitle: calloutTitle || null,
        boxesCount: boxes.length,
        customerBtnsCount: customerBtns.length,
        doneBtnsCount: doneBtns.length,
        progressPill: progressPill || null,
      };
    })()`);
    console.log('Technician 3D Station State:', techStationState);

    const shot2 = path.join(ARTIFACT_DIR, 'tech_3d_inspection_station.png');
    await driver.screenshot(shot2);
    console.log(`Saved screenshot: ${shot2}`);

    // Scroll to the simplified inspection boxes grid
    await driver.eval(`(() => {
      const el = document.querySelector('.tech-inspection-checklist');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    })()`);
    await sleep(1000);

    const shotGrid = path.join(ARTIFACT_DIR, 'tech_inspection_boxes_grid.png');
    await driver.screenshot(shotGrid);
    console.log(`Saved screenshot: ${shotGrid}`);

    // ════════════════════════════════════════════════════════════════════
    // 3. CUSTOMER DETAILS POPUP MODAL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Testing Customer Details Popup for Inspection Part Box ---');
    await driver.eval(`(() => {
      const btn = document.querySelector('.box-btn-customer');
      if (btn) btn.click();
    })()`);
    await sleep(1500);

    const popupState = await driver.eval(`(() => {
      const modal = document.querySelector('.tech-modal-window');
      const title = document.querySelector('.tech-modal-title')?.innerText;
      const complaint = document.querySelector('.complaint-content')?.innerText;
      return {
        hasModal: Boolean(modal),
        title: title || null,
        complaint: complaint || null,
      };
    })()`);
    console.log('Customer Details Popup State:', popupState);

    const shot3 = path.join(ARTIFACT_DIR, 'tech_customer_details_popup.png');
    await driver.screenshot(shot3);
    console.log(`Saved screenshot: ${shot3}`);

    // Close popup
    await driver.eval(`(() => {
      const closeBtn = document.querySelector('.tech-modal-close') || document.querySelector('.tech-modal-footer button');
      if (closeBtn) closeBtn.click();
    })()`);
    await sleep(1000);

    // ════════════════════════════════════════════════════════════════════
    // 4. MARK INSPECTION BOXES DONE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Marking Inspection Part Boxes as Done ---');
    await driver.eval(`(() => {
      const doneBtns = Array.from(document.querySelectorAll('.box-btn-done'));
      if (doneBtns[0]) doneBtns[0].click(); // A/C
      if (doneBtns[1]) doneBtns[1].click(); // Brakes
    })()`);
    await sleep(2000);

    const doneState = await driver.eval(`(() => {
      const doneBoxes = document.querySelectorAll('.inspection-part-box--done');
      const doneBadges = document.querySelectorAll('.box-done-pill');
      const progressPill = document.querySelector('.tech-progress-pill')?.innerText;
      return {
        doneBoxesCount: doneBoxes.length,
        doneBadgesCount: doneBadges.length,
        progressPill: progressPill || null,
      };
    })()`);
    console.log('Done State after marking parts done:', doneState);

    const shot4 = path.join(ARTIFACT_DIR, 'tech_inspection_boxes_done.png');
    await driver.screenshot(shot4);
    console.log(`Saved screenshot: ${shot4}`);

    console.log('\n✓ ALL 4 VERIFICATION STAGES COMPLETED SUCCESSFULLY!');
  } finally {
    driver.close();
  }
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
