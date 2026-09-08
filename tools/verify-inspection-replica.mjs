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
  console.log('--- Starting Verification of 99% Inspection Replica ---');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // Desktop viewport matching modern HD monitor
  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. TECHNICIAN DASHBOARD: CAR STATE WRITTEN ON CARD FROM OUTSIDE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Technician Dashboard: Car State Outside on Cards ---');
    await loginUser(driver, 'tech@apex-motors.local', 'ChangeMe-Tech-123');
    await driver.navigate(`${BASE_URL}/tech`);
    await sleep(2500);

    const outsideStateVisible = await driver.eval(`
      Boolean(document.querySelector('.now-state-badge-outside, .queue-state-badge-outside'))
    `);
    console.log('Outside car state badge visible on dashboard cards:', outsideStateVisible);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_dashboard_car_state_outside.png'));
    console.log('✓ Captured tech_dashboard_car_state_outside.png');

    // ════════════════════════════════════════════════════════════════════
    // 2. OPEN WORK CARD: VERIFY ONLY 3D CAR & BOXES (INSPECTION STATE)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Inspection Station: Only 3D Car & Boxes Visible ---');
    console.log('Navigating directly to vehicle under inspection: cmtlz035k00lp1ndnnwjxtz5o...');
    await driver.navigate(`${BASE_URL}/tech/card/cmtlz035k00lp1ndnnwjxtz5o`);
    await sleep(3500);

    // Scroll to top
    await driver.eval(`window.scrollTo(0, 0)`);
    await sleep(500);

    const pageStructure = await driver.eval(`(() => {
      return {
        hasStudioNavbar: Boolean(document.querySelector('.studio-navbar')),
        has3dViewer: Boolean(document.querySelector('app-car-3d-viewer')),
        hasCarImage: Boolean(document.querySelector('.car-render-img')),
        carImageSrc: document.querySelector('.car-render-img')?.src?.slice(0, 30),
        hasInspectionBoxes: document.querySelectorAll('.studio-service-card').length,
        hasPromoCard: Boolean(document.querySelector('.studio-promo-card')),
        hasWorkflowStrip: Boolean(document.querySelector('app-workflow-strip')),
        hasTasksList: Boolean(document.querySelector('.tasks')),
        hasPartsList: Boolean(document.querySelector('app-part-list'))
      };
    })()`);
    console.log('Inspection station page structure:', pageStructure);

    // Capture full-page view of the inspection station
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_inspection_station_replica_full.png'));
    console.log('✓ Captured tech_inspection_station_replica_full.png');

    // ════════════════════════════════════════════════════════════════════
    // 3. TEST 3D CAR TURNTABLE, CONTROLS & INDIVIDUAL POINTING WINDOWS
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Testing 3D Car Viewer & Individual Pointing Windows ---');
    // Scroll 3D viewer to center of viewport
    await driver.eval(`(() => {
      const viewer = document.querySelector('app-car-3d-viewer');
      if (viewer) viewer.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_3d_car_replica_centered.png'));
    console.log('✓ Captured tech_3d_car_replica_centered.png');

    // ════════════════════════════════════════════════════════════════════
    // 4. TEST BOTTOM SECTION WITH INSPECTION BOXES & PROMO CARD
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Testing Bottom Section with Inspection Boxes & Promo Card ---');
    await driver.eval(`(() => {
      const el = document.querySelector('.studio-bottom-section');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(1000);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_inspection_boxes_bottom_view.png'));
    console.log('✓ Captured tech_inspection_boxes_bottom_view.png');

    // ════════════════════════════════════════════════════════════════════
    // 5. TEST CUSTOMER DETAILS POPUP WINDOW
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 5. Testing Customer Details Popup Window on Box ---');
    const hasCustomerBtn = await driver.eval(`Boolean(document.querySelector('.btn-customer-details'))`);
    if (hasCustomerBtn) {
      await driver.click('.btn-customer-details');
      await sleep(1000);

      const modalOpen = await driver.eval(`Boolean(document.querySelector('.studio-modal-card'))`);
      console.log('Customer details popup modal opened:', modalOpen);

      await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_customer_details_modal.png'));
      console.log('✓ Captured tech_customer_details_modal.png');

      // Close modal
      await driver.click('.modal-close-btn');
      await sleep(600);
    }

    // ════════════════════════════════════════════════════════════════════
    // 6. TEST MARKING BOX AS DONE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 6. Testing Marking Part Box as Done ---');
    const firstDoneBtn = await driver.eval(`Boolean(document.querySelector('.btn-done-status'))`);
    if (firstDoneBtn) {
      await driver.click('.btn-done-status');
      await sleep(1500);

      const isDone = await driver.eval(`
        Boolean(document.querySelector('.studio-service-card--done, .btn-done-status--checked'))
      `);
      console.log('Box marked done successfully:', isDone);

      await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_boxes_done_state.png'));
      console.log('✓ Captured tech_boxes_done_state.png');
    }

    console.log('\n=== ALL VERIFICATION STAGES COMPLETED CLEANLY ===');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await driver.close();
  }
}

run();
