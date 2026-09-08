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
  console.log('=== Starting Real 3D Car & English Inspection Station Verification ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. OUTSIDE CAR STATE BADGE (100% ENGLISH) ON DASHBOARD
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Technician Dashboard: Outside Car State Badge in English ---');
    await loginUser(driver, 'tech@apex-motors.local', 'ChangeMe-Tech-123');
    await driver.navigate(`${BASE_URL}/tech`);
    await sleep(2500);

    const outsideBadgeText = await driver.eval(`
      document.querySelector('.now-state-badge-outside .badge-text, .queue-state-badge-outside .badge-label')?.textContent?.trim()
    `);
    console.log('Outside car state badge text:', outsideBadgeText);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_dashboard_car_state_outside_en.png'));
    console.log('✓ Captured tech_dashboard_car_state_outside_en.png');

    // ════════════════════════════════════════════════════════════════════
    // 2. INSPECTION WORK CARD: FULL-WIDTH, REAL 3D CAR, NO NAVBAR, NO PROMO
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Inspection Work Card Layout & Real 3D Car ---');
    console.log('Clicking queue card for vehicle under inspection (cmtlz035k00lp1ndnnwjxtz5o)...');
    await driver.click('a[href*="cmtlz035k00lp1ndnnwjxtz5o"]');
    await sleep(3500);

    // Scroll to top
    await driver.eval(`window.scrollTo(0, 0)`);
    await sleep(500);

    const inspectionLayout = await driver.eval(`(() => {
      return {
        hasStudioNavbar: Boolean(document.querySelector('.studio-navbar')),
        hasTopBar: Boolean(document.querySelector('.studio-top-bar')),
        hasPromoCard: Boolean(document.querySelector('.studio-promo-card')),
        has3dCanvas: Boolean(document.querySelector('canvas.car-webgl-canvas')),
        canvasWidth: document.querySelector('canvas.car-webgl-canvas')?.clientWidth,
        canvasHeight: document.querySelector('canvas.car-webgl-canvas')?.clientHeight,
        rotationBannerText: document.querySelector('.rotation-hint-banner .hint-text')?.textContent?.trim(),
        sidebarTitle: document.querySelector('.sidebar-title')?.textContent?.trim(),
        sidebarItemsCount: document.querySelectorAll('.sidebar-part-item').length,
        pointingWindowsCount: document.querySelectorAll('.pointing-window').length,
        inspectionBoxesCount: document.querySelectorAll('.studio-service-card').length,
        firstBoxTitle: document.querySelector('.studio-service-card .service-title')?.textContent?.trim()
      };
    })()`);
    console.log('Inspection layout analysis:', inspectionLayout);

    // Capture Full 3D Car Visualizer view
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_real_3d_car_visualizer_full.png'));
    console.log('✓ Captured tech_real_3d_car_visualizer_full.png');

    // ════════════════════════════════════════════════════════════════════
    // 3. TEST 360° MOUSE DRAG ROTATION ON 3D CANVAS
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Testing Real 3D 360° Drag Rotation ---');
    // Dispatch mouse drag events on canvas
    await driver.eval(`(() => {
      const canvas = document.querySelector('canvas.car-webgl-canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const startX = rect.left + rect.width * 0.5;
        const startY = rect.top + rect.height * 0.5;
        
        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: startY, button: 0, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: startX - 180, clientY: startY + 30, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: startX - 180, clientY: startY + 30, bubbles: true }));
      }
    })()`);
    await sleep(1000);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_real_3d_car_rotated_angle.png'));
    console.log('✓ Captured tech_real_3d_car_rotated_angle.png');

    // ════════════════════════════════════════════════════════════════════
    // 4. TEST BOTTOM INSPECTION CHECKPOINT BOXES (FULL WIDTH)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Testing Full-Width Inspection Checkpoints Grid ---');
    await driver.eval(`(() => {
      const section = document.querySelector('.studio-bottom-section');
      if (section) section.scrollIntoView({ behavior: 'instant', block: 'start' });
    })()`);
    await sleep(800);

    const boxesInfo = await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.studio-service-card'));
      return cards.map(c => ({
        title: c.querySelector('.service-title')?.textContent?.trim(),
        desc: c.querySelector('.service-desc')?.textContent?.trim(),
        isDone: Boolean(c.querySelector('.btn-done-status--checked'))
      }));
    })()`);
    console.log('Inspection checkpoint boxes:', boxesInfo);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_inspection_boxes_full_width.png'));
    console.log('✓ Captured tech_inspection_boxes_full_width.png');

    // ════════════════════════════════════════════════════════════════════
    // 5. TEST CUSTOMER DETAILS MODAL (CLEAN ENGLISH, CLOSE BUTTON ONLY)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 5. Testing Customer Details Modal Window ---');
    await driver.click('.btn-customer-details');
    await sleep(800);

    const modalInfo = await driver.eval(`(() => {
      return {
        isOpen: Boolean(document.querySelector('.studio-modal-card')),
        title: document.querySelector('.modal-title')?.textContent?.trim(),
        hasOldConfirmBtn: Boolean(document.querySelector('.btn-mark-done')),
        hasCloseBtn: Boolean(document.querySelector('.modal-footer .btn-cancel')),
        closeBtnText: document.querySelector('.modal-footer .btn-cancel')?.textContent?.trim()
      };
    })()`);
    console.log('Customer details modal verification:', modalInfo);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_customer_details_modal_clean_en.png'));
    console.log('✓ Captured tech_customer_details_modal_clean_en.png');

    // Close modal
    await driver.click('.modal-footer .btn-cancel');
    await sleep(600);

    // ════════════════════════════════════════════════════════════════════
    // 6. TEST DOWN-LEFT PROCEED BUTTON (LOCKED UNTIL ALL BOXES ARE DONE)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 6. Testing Down-Left Proceed Button & Lock Mechanism ---');
    await driver.eval(`(() => {
      const footer = document.querySelector('.inspection-footer-actions');
      if (footer) footer.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(600);

    const initialButtonState = await driver.eval(`(() => {
      const btn = document.querySelector('.btn-complete-inspection');
      return {
        text: btn?.textContent?.trim(),
        isDisabled: btn?.hasAttribute('disabled'),
        isReadyClass: btn?.classList.contains('btn-complete-inspection--ready'),
        hintText: document.querySelector('.action-gate-hint, .action-gate-ready')?.textContent?.trim()
      };
    })()`);
    console.log('Initial Down-Left button state (not all boxes done):', initialButtonState);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_proceed_button_locked_unlit.png'));
    console.log('✓ Captured tech_proceed_button_locked_unlit.png');

    // Now mark all boxes as done!
    console.log('Marking all checkpoint boxes as Done...');
    const uncompletedButtons = await driver.eval(`
      Array.from(document.querySelectorAll('.studio-service-card:not(.studio-service-card--done) .btn-done-status')).length
    `);
    console.log(`Found ${uncompletedButtons} uncompleted boxes.`);

    for (let i = 0; i < uncompletedButtons; i++) {
      await driver.click('.studio-service-card:not(.studio-service-card--done) .btn-done-status');
      await sleep(1000);
    }

    const allDoneState = await driver.eval(`(() => {
      const btn = document.querySelector('.btn-complete-inspection');
      return {
        completedPill: document.querySelector('.completion-pill')?.textContent?.trim(),
        isDisabled: btn?.hasAttribute('disabled'),
        isReadyClass: btn?.classList.contains('btn-complete-inspection--ready'),
        readyText: document.querySelector('.action-gate-ready')?.textContent?.trim()
      };
    })()`);
    console.log('After completing all boxes, proceed button state:', allDoneState);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_proceed_button_unlocked_glowing.png'));
    console.log('✓ Captured tech_proceed_button_unlocked_glowing.png');

    // ════════════════════════════════════════════════════════════════════
    // 7. CLICK PROCEED BUTTON: UNLOCK FIXING / REPAIR STAGE
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 7. Clicking Proceed Button to Advance to Repair Stage ---');
    await driver.click('.btn-complete-inspection');
    await sleep(3500);

    const afterProceed = await driver.eval(`(() => {
      return {
        url: window.location.href,
        hasTasks: Boolean(document.querySelector('.tasks')),
        hasParts: Boolean(document.querySelector('app-part-list')),
        hasWorkflowStrip: Boolean(document.querySelector('app-workflow-strip')),
        hasPlateTitle: document.querySelector('.card-plate')?.textContent?.trim()
      };
    })()`);
    console.log('Post-inspection repair stage view:', afterProceed);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_repair_stage_unlocked.png'));
    console.log('✓ Captured tech_repair_stage_unlocked.png');

    console.log('\n=== ALL VERIFICATION STEPS COMPLETED CLEANLY ===');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await driver.close();
  }
}

run();
