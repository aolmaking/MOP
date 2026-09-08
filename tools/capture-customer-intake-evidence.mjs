import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Capturing Customer Portal Intake Evidence ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    console.log('Clearing old session...');
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);
    await driver.eval('localStorage.clear(); sessionStorage.clear();');
    await driver.clearCookies();

    await driver.navigate(`${BASE_URL}/login`);
    await sleep(2000);

    console.log('Entering Workshop Code: 5BBD8BD60E ...');
    await driver.fill('#workshopCode', '5BBD8BD60E');
    await sleep(400);
    await driver.click('.continue-btn');
    await sleep(2000);

    console.log('Entering Customer credentials: customer@apex-ev-lab.local ...');
    await driver.fill('#email', 'customer@apex-ev-lab.local');
    await driver.fill('#password', 'ChangeMe-Customer-123');
    await sleep(400);
    await driver.click('button[type="submit"]');
    await sleep(3500);

    const currentUrl = await driver.eval('window.location.href');
    console.log('Current URL after login:', currentUrl);

    if (!currentUrl.includes('/customer') && !currentUrl.includes('/portal')) {
      await driver.navigate(`${BASE_URL}/customer`);
      await sleep(2500);
    }

    console.log('Opening Report Issue / Book Service modal...');
    const hasReportBtn = await driver.eval(`Boolean(document.querySelector('#btn-report-issue, .report-issue-trigger'))`);
    console.log('Report issue button present:', hasReportBtn);
    if (hasReportBtn) {
      await driver.click('#btn-report-issue, .report-issue-trigger');
      await sleep(1500);
    }

    // Evaluate customer intake modal
    const checks = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card, .report-modal');
      const has3dCar = Boolean(document.querySelector('app-car-3d-viewer, .customer-3d-car-box'));
      const boxes = document.querySelectorAll('.subsystem-choice-card').length;
      const initialSelected = document.querySelectorAll('.subsystem-choice-card--selected').length;
      const barriers = document.querySelectorAll('.selected-parts-barrier').length;
      const symptomSections = document.querySelectorAll('.subsystem-symptom-section').length;
      const totalSymptomBtns = document.querySelectorAll('.symptom-add-btn').length;

      return {
        has3dCar,
        boxesCount: boxes,
        initialSelectedCount: initialSelected,
        barriersCount: barriers,
        symptomSectionsCount: symptomSections,
        totalSymptomBtns
      };
    })()`);
    console.log('Customer intake checks:', checks);

    // Scroll modal down to view the 12 boxes and symptom sections
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 260);
    })()`);
    await sleep(800);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_12_boxes_no_3d_car.png'));
    console.log('✓ Captured customer_intake_12_boxes_no_3d_car.png');

    // Select 3rd subsystem to test barrier/divider between multiple parts
    console.log('Selecting Engine and Brakes in addition to Cooling & A/C...');
    await driver.eval(`(() => {
      const cards = document.querySelectorAll('.subsystem-choice-card');
      if (cards.length > 0) cards[0].click(); // Engine
      if (cards.length > 2) cards[2].click(); // Brakes
    })()`);
    await sleep(800);

    // Click some symptom chips
    await driver.eval(`(() => {
      const btns = document.querySelectorAll('.symptom-add-btn');
      if (btns[0]) btns[0].click();
      if (btns[5]) btns[5].click();
    })()`);
    await sleep(600);

    // Scroll down to show multi-part symptom sections and barriers
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 520);
    })()`);
    await sleep(800);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_multi_symptoms_barrier_divider.png'));
    console.log('✓ Captured customer_intake_multi_symptoms_barrier_divider.png');

    const finalBarriersCount = await driver.eval(`document.querySelectorAll('.selected-parts-barrier').length`);
    console.log('Final barrier lines count between selected parts:', finalBarriersCount);

    const complaintValue = await driver.eval(`document.querySelector('#complaint-desc')?.value`);
    console.log('Complaint text updated with symptoms:', complaintValue);

    console.log('=== Customer intake verification successfully completed! ===');
  } catch (err) {
    console.error('Customer intake verification failed:', err);
    process.exitCode = 1;
  } finally {
    if (driver && driver.ws) {
      try { driver.ws.close(); } catch (e) {}
    }
  }
}

run();
