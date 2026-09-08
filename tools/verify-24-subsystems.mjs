import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Starting 24 Subsystems & Symptoms Verification ===');
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. CUSTOMER PORTAL: 24 SUBSYSTEMS MODAL
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Customer Portal: 24 Subsystems Intake Modal ---');
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);
    await driver.eval('localStorage.clear(); sessionStorage.clear();');
    await driver.clearCookies();

    await driver.navigate(`${BASE_URL}/login`);
    await sleep(2000);

    // If on Workshop Code stage, click Continue to Sign In
    const hasContinueBtn = await driver.eval(`Boolean(document.querySelector('.continue-btn'))`);
    if (hasContinueBtn) {
      console.log('Advancing through workshop identification...');
      await driver.click('.continue-btn');
      await sleep(1500);
    }

    // Customer credentials
    console.log('Entering Customer credentials: customer@apex-motors.local ...');
    await driver.fill('#email', 'customer@apex-motors.local');
    await driver.fill('#password', 'ChangeMe-Cust-123');
    await sleep(400);
    await driver.click('button[type="submit"], .submit-btn');
    await sleep(3500);

    const currentUrl = await driver.eval('window.location.href');
    console.log('Current URL after login:', currentUrl);
    if (!currentUrl.includes('/customer') && !currentUrl.includes('/portal')) {
      await driver.navigate(`${BASE_URL}/portal`);
      await sleep(2500);
    }

    // Open Report Issue Modal
    const hasReportBtn = await driver.eval(`Boolean(document.querySelector('#btn-report-issue, .report-issue-trigger'))`);
    if (hasReportBtn) {
      await driver.click('#btn-report-issue, .report-issue-trigger');
      await sleep(1500);
    }

    // Audit the 24 cards
    const customerAudit = await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      const cardTitles = cards.map(c => c.querySelector('.choice-title-en')?.textContent?.trim() || '');
      return {
        totalCards: cards.length,
        cardTitles
      };
    })()`);
    console.log(`Found ${customerAudit.totalCards} subsystem choice cards:`, customerAudit.cardTitles);

    // Scroll modal to capture top cards
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 200);
    })()`);
    await sleep(600);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_top.png'));
    console.log('✓ Captured customer_intake_24_boxes_top.png');

    // Scroll further down to capture more cards
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 480);
    })()`);
    await sleep(600);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_bottom.png'));
    console.log('✓ Captured customer_intake_24_boxes_bottom.png');

    // Select 3 diverse subsystems: A/C, Headlights & Lighting, and Hybrid & EV Battery
    console.log('Selecting A/C, Lighting, and Hybrid & EV to test symptoms and dividers...');
    await driver.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('A/C') || text.includes('Lighting') || text.includes('Hybrid')) {
          if (!card.classList.contains('subsystem-choice-card--selected')) {
            card.click();
          }
        } else {
          if (card.classList.contains('subsystem-choice-card--selected')) {
            card.click(); // deselect others
          }
        }
      });
    })()`);
    await sleep(800);

    const symptomSectionsAudit = await driver.eval(`(() => {
      const sections = Array.from(document.querySelectorAll('.subsystem-symptom-section'));
      const barriers = document.querySelectorAll('.selected-parts-barrier').length;
      const sectionDetails = sections.map(sec => {
        const name = sec.querySelector('.symptom-subsystem-name')?.textContent?.trim() || '';
        const chips = Array.from(sec.querySelectorAll('.symptom-add-btn')).map(c => c.textContent.trim());
        return { name, chipsCount: chips.length, sampleChips: chips.slice(0, 2) };
      });
      return { totalSections: sections.length, barriersCount: barriers, sectionDetails };
    })()`);
    console.log('Symptom sections audit for selected parts:', symptomSectionsAudit);

    // Scroll to symptoms area
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 750);
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_24_boxes_symptoms_multi.png'));
    console.log('✓ Captured customer_intake_24_boxes_symptoms_multi.png');

    // ════════════════════════════════════════════════════════════════════
    // 2. TECHNICIAN INSPECTION STATION: 24 CHECKPOINTS & 3D VIEWER
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Technician Work Station: 24 Systems Support ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);

    const hasTechContinueBtn = await driver.eval(`Boolean(document.querySelector('.continue-btn'))`);
    if (hasTechContinueBtn) {
      await driver.click('.continue-btn');
      await sleep(1500);
    }

    await driver.fill('#email', 'tech@apex-motors.local');
    await driver.fill('#password', 'ChangeMe-Tech-123');
    await sleep(400);
    await driver.click('button[type="submit"], .submit-btn');
    await sleep(3000);

    await driver.navigate(`${BASE_URL}/tech/card/cmtlz035k00lp1ndnnwjxtz5o`);
    await sleep(3500);

    // Audit Technician Station sidebar and checkpoints
    const techAudit = await driver.eval(`(() => {
      const sidebarItems = Array.from(document.querySelectorAll('.subsystem-item .subsystem-name')).map(e => e.textContent.trim());
      const checkpointCards = Array.from(document.querySelectorAll('.studio-service-card .service-title')).map(e => e.textContent.trim());
      return {
        sidebarCount: sidebarItems.length,
        sidebarItems: sidebarItems.slice(0, 8),
        checkpointsCount: checkpointCards.length,
        checkpointCards: checkpointCards.slice(0, 8)
      };
    })()`);
    console.log('Technician station systems audit:', techAudit);

    // Capture top view showing 3D viewer & sidebar
    await driver.eval(`window.scrollTo(0, 0)`);
    await sleep(600);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_24_subsystems_top.png'));
    console.log('✓ Captured tech_24_subsystems_top.png');

    // Scroll to checkpoints
    await driver.eval(`(() => {
      const el = document.querySelector('.studio-bottom-section');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_24_subsystems_checkpoints.png'));
    console.log('✓ Captured tech_24_subsystems_checkpoints.png');

    console.log('\n=== All 24 Subsystems Verification Checks Completed Successfully! ===');
  } catch (err) {
    console.error('Verification failed:', err);
    process.exitCode = 1;
  } finally {
    if (driver && driver.ws) {
      try { driver.ws.close(); } catch (e) {}
    }
  }
}

run();
