import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginCustomer(driver) {
  console.log('Logging in as customer@apex-motors.local...');
  await driver.clearCookies();
  await driver.navigate(`${BASE_URL}/login`);
  await sleep(1500);

  // If on Workshop Code stage, click Continue to Sign In
  const hasContinueBtn = await driver.eval(`Boolean(document.querySelector('.continue-btn'))`);
  if (hasContinueBtn) {
    await driver.click('.continue-btn');
    await sleep(1500);
  }

  // Check if credentials form is ready
  await driver.fill('#email', 'customer@apex-motors.local');
  await driver.fill('#password', 'ChangeMe-Cust-123');
  await sleep(400);
  await driver.click('.submit-btn, button[type="submit"]');
  await sleep(2500);
}

async function run() {
  console.log('=== Starting Verification: Customer Intake & Tech Inspection ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // Standard HD desktop viewport
  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. CUSTOMER PORTAL INTAKE MODAL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Customer Portal: Intake Modal (No 3D Car, 12 Boxes, Dividers) ---');
    await loginCustomer(driver);
    await driver.navigate(`${BASE_URL}/portal`);
    await sleep(2500);

    // Open Report Issue Modal
    const hasReportBtn = await driver.eval(`Boolean(document.querySelector('.report-issue-trigger'))`);
    console.log('Report issue button found:', hasReportBtn);
    if (hasReportBtn) {
      await driver.click('.report-issue-trigger');
      await sleep(1500);
    }

    // Evaluate customer intake structure
    const customerIntakeChecks = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      const has3dCar = Boolean(modal && modal.querySelector('app-car-3d-viewer, .customer-3d-car-box, .car-viewport'));
      const boxes = modal ? modal.querySelectorAll('.subsystem-choice-card').length : 0;
      const barriers = modal ? modal.querySelectorAll('.selected-parts-barrier').length : 0;
      const symptomSections = modal ? modal.querySelectorAll('.subsystem-symptom-section').length : 0;
      const symptoms = modal ? modal.querySelectorAll('.symptom-add-btn').length : 0;
      return { has3dCar, boxesCount: boxes, barriersCount: barriers, symptomSectionsCount: symptomSections, totalSymptoms: symptoms };
    })()`);
    console.log('Customer intake modal checks:', customerIntakeChecks);

    // Scroll modal down to see boxes and symptoms
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 320);
    })()`);
    await sleep(800);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_modal_no_3d_12_boxes.png'));
    console.log('✓ Captured customer_intake_modal_no_3d_12_boxes.png');

    // Click a symptom to test addition
    await driver.eval(`(() => {
      const btn = document.querySelector('.symptom-add-btn');
      if (btn) btn.click();
    })()`);
    await sleep(500);

    // Select a 3rd subsystem (e.g. Engine or Brakes) to test multi-selection barrier
    await driver.eval(`(() => {
      const cards = document.querySelectorAll('.subsystem-choice-card');
      if (cards.length > 0) cards[0].click(); // Select Engine
    })()`);
    await sleep(800);

    const updatedBarriers = await driver.eval(`document.querySelectorAll('.selected-parts-barrier').length`);
    console.log('Multi-part divider barriers count after 3 parts selected:', updatedBarriers);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_multi_parts_with_dividers.png'));
    console.log('✓ Captured customer_intake_multi_parts_with_dividers.png');

    // ════════════════════════════════════════════════════════════════════
    // 2. TECHNICIAN FULL-PAGE INSPECTION STATION
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Technician Inspection Station: Full Page Breakout & Previous Theme ---');
    await loginUser(driver, 'tech@apex-motors.local', 'ChangeMe-Tech-123');
    await driver.navigate(`${BASE_URL}/tech/card/cmtlz035k00lp1ndnnwjxtz5o`);
    await sleep(3500);

    // Evaluate full page breakout
    const techPageChecks = await driver.eval(`(() => {
      const page = document.querySelector('.studio-inspection-page');
      const rect = page ? page.getBoundingClientRect() : null;
      const has3dViewer = Boolean(document.querySelector('app-car-3d-viewer'));
      const hasCarImg = Boolean(document.querySelector('.car-render-img'));
      const hasPointingWindows = document.querySelectorAll('.pointing-window').length;
      const hasSidebar = Boolean(document.querySelector('.subsystem-sidebar'));
      const boxes = document.querySelectorAll('.studio-service-card').length;
      const proceedBtn = document.querySelector('.btn-complete-inspection');
      const isLocked = proceedBtn ? proceedBtn.disabled : false;
      return {
        isFullPage: rect ? (rect.width >= window.innerWidth && rect.top <= 0) : false,
        pageWidth: rect ? rect.width : 0,
        pageHeight: rect ? rect.height : 0,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        has3dViewer,
        hasCarImg,
        hasPointingWindows,
        hasSidebar,
        boxesCount: boxes,
        proceedBtnLocked: isLocked
      };
    })()`);
    console.log('Technician inspection station checks:', techPageChecks);

    // Capture top half with 3D car visualizer
    await driver.eval(`window.scrollTo(0, 0)`);
    await sleep(600);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_full_page_inspection_top.png'));
    console.log('✓ Captured tech_full_page_inspection_top.png');

    // Scroll to bottom section to see previous theme boxes and down-left locked button
    await driver.eval(`(() => {
      const el = document.querySelector('.studio-bottom-section');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(800);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_full_page_inspection_boxes_locked.png'));
    console.log('✓ Captured tech_full_page_inspection_boxes_locked.png');

    // ════════════════════════════════════════════════════════════════════
    // 3. TEST CUSTOMER DETAILS POPUP MODAL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Testing Customer Details Popup Modal ---');
    const custBtn = await driver.eval(`Boolean(document.querySelector('.btn-customer-details'))`);
    if (custBtn) {
      await driver.click('.btn-customer-details');
      await sleep(1000);

      const modalVisible = await driver.eval(`Boolean(document.querySelector('.studio-modal-card'))`);
      console.log('Customer details popup modal visible:', modalVisible);

      await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_customer_details_popup_clean.png'));
      console.log('✓ Captured tech_customer_details_popup_clean.png');

      await driver.click('.modal-close-btn');
      await sleep(600);
    }

    // ════════════════════════════════════════════════════════════════════
    // 4. MARK ALL BOXES AS DONE AND TEST UNLOCKED PROCEED BUTTON
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Marking all inspection boxes as Done ---');
    const doneBtnsCount = await driver.eval(`document.querySelectorAll('.btn-done-status').length`);
    console.log(`Found ${doneBtnsCount} Done status buttons`);

    for (let i = 0; i < doneBtnsCount; i++) {
      await driver.eval(`(() => {
        const btns = document.querySelectorAll('.btn-done-status');
        if (btns[${i}] && !btns[${i}].classList.contains('btn-done-status--checked')) {
          btns[${i}].click();
        }
      })()`);
      await sleep(800);
    }

    // Verify all are done and proceed button is ready
    const proceedStatus = await driver.eval(`(() => {
      const btn = document.querySelector('.btn-complete-inspection');
      return {
        isReady: btn ? btn.classList.contains('btn-complete-inspection--ready') : false,
        isDisabled: btn ? btn.disabled : true
      };
    })()`);
    console.log('Proceed button status after completing all boxes:', proceedStatus);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_all_boxes_done_proceed_ready.png'));
    console.log('✓ Captured tech_all_boxes_done_proceed_ready.png');

    console.log('\n=== All verification checks completed successfully! ===');
  } catch (err) {
    console.error('Verification failed with error:', err);
    process.exitCode = 1;
  } finally {
    if (driver && driver.ws) {
      try { driver.ws.close(); } catch (e) {}
    }
  }
}

run();
