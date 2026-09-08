import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Capturing Customer Portal with 24 Subsystems ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);
    await driver.eval('localStorage.clear(); sessionStorage.clear();');

    await driver.navigate(`${BASE_URL}/login`);
    await sleep(2000);

    console.log('Filling Workshop Code: 5BBD8BD60E ...');
    await driver.eval(`(() => {
      const codeInput = document.querySelector('#workshopCode');
      if (codeInput) {
        codeInput.value = '5BBD8BD60E';
        codeInput.dispatchEvent(new Event('input', { bubbles: true }));
        codeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(500);
    await driver.click('.continue-btn');
    await sleep(2000);

    console.log('Entering customer credentials...');
    await driver.eval(`(() => {
      const email = document.querySelector('#email');
      if (email) {
        email.value = 'customer@apex-ev-lab.local';
        email.dispatchEvent(new Event('input', { bubbles: true }));
        email.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const pass = document.querySelector('#password');
      if (pass) {
        pass.value = 'ChangeMe-Customer-123';
        pass.dispatchEvent(new Event('input', { bubbles: true }));
        pass.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await sleep(500);
    await driver.click('button[type="submit"], .submit-btn');
    await sleep(3500);

    const currentUrl = await driver.eval('window.location.href');
    console.log('Logged in URL:', currentUrl);
    if (!currentUrl.includes('/customer') && !currentUrl.includes('/portal')) {
      await driver.navigate(`${BASE_URL}/customer`);
      await sleep(2500);
    }

    // Open Report Issue Modal
    console.log('Opening Report Issue Modal...');
    await driver.click('#btn-report-issue, .report-issue-trigger');
    await sleep(1500);

    // Audit cards count
    const cardAudit = await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      return {
        count: cards.length,
        titles: cards.map(c => c.querySelector('.choice-title-en')?.textContent?.trim() || '')
      };
    })()`);
    console.log(`Found ${cardAudit.count} subsystem choice cards in modal:`, cardAudit.titles);

    // Scroll down slightly inside modal to capture the 24 cards grid
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 180);
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_grid_top.png'));
    console.log('✓ Captured customer_intake_24_boxes_grid_top.png');

    // Scroll more to see bottom cards of the 24
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 480);
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_grid_bottom.png'));
    console.log('✓ Captured customer_intake_24_boxes_grid_bottom.png');

    // Select 3 parts: Ignition, Headlights, and Doors/Locks
    console.log('Selecting Ignition, Headlights & Lighting, and Doors, Locks & Windows...');
    await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Ignition') || text.includes('Lighting') || text.includes('Doors')) {
          if (!card.classList.contains('subsystem-choice-card--selected')) {
            card.click();
          }
        }
      });
    })()`);
    await sleep(1000);

    // Click a symptom chip in Ignition to test adding to complaint notes
    await driver.eval(`(() => {
      const firstChip = document.querySelector('.symptom-add-btn');
      if (firstChip) firstChip.click();
    })()`);
    await sleep(600);

    // Scroll to the symptoms sections and divider lines
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 850);
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_symptoms_with_dividers.png'));
    console.log('✓ Captured customer_intake_24_boxes_symptoms_with_dividers.png');

    console.log('=== Customer Portal 24 Subsystems Capture Completed! ===');
  } catch (err) {
    console.error('Capture failed:', err);
    process.exitCode = 1;
  } finally {
    if (driver && driver.ws) {
      try { driver.ws.close(); } catch (e) {}
    }
  }
}

run();
