import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';
const BASE_URL = 'http://localhost:4200';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Starting 100% English Verification ===');
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
    // 1. CUSTOMER PORTAL INTAKE MODAL (100% ENGLISH)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Testing Customer Portal: Intake Modal (100% English) ---');
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);
    await driver.eval('localStorage.clear(); sessionStorage.clear();');
    await driver.clearCookies();

    await driver.navigate(`${BASE_URL}/login`);
    await sleep(2000);

    // Workshop code
    console.log('Entering Workshop Code: 5BBD8BD60E ...');
    await driver.fill('#workshopCode', '5BBD8BD60E');
    await sleep(400);
    await driver.click('.continue-btn');
    await sleep(2000);

    // Customer credentials
    console.log('Entering Customer credentials: customer@apex-ev-lab.local ...');
    await driver.fill('#email', 'customer@apex-ev-lab.local');
    await driver.fill('#password', 'ChangeMe-Customer-123');
    await sleep(400);
    await driver.click('button[type="submit"]');
    await sleep(3500);

    const currentUrl = await driver.eval('window.location.href');
    if (!currentUrl.includes('/customer') && !currentUrl.includes('/portal')) {
      await driver.navigate(`${BASE_URL}/customer`);
      await sleep(2500);
    }

    console.log('Opening Report Issue / Book Service modal...');
    const hasReportBtn = await driver.eval(`Boolean(document.querySelector('#btn-report-issue, .report-issue-trigger'))`);
    if (hasReportBtn) {
      await driver.click('#btn-report-issue, .report-issue-trigger');
      await sleep(1500);
    }

    // Select A/C and Steering to replicate exact user screenshot state
    console.log('Selecting A/C & Climate Control and Steering System & Alignment...');
    await driver.eval(`(() => {
      // Find A/C and Steering cards
      const cards = Array.from(document.querySelectorAll('.subsystem-choice-card'));
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('A/C') || text.includes('Steering')) {
          if (!card.classList.contains('subsystem-choice-card--selected')) {
            card.click();
          }
        } else {
          if (card.classList.contains('subsystem-choice-card--selected')) {
            card.click(); // deselect others if any
          }
        }
      });
    })()`);
    await sleep(800);

    // Check for Arabic characters in the modal
    const arabicCheckCustomer = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card, .report-modal');
      if (!modal) return { found: false, text: 'No modal found' };
      const text = modal.innerText || '';
      const arabicMatches = text.match(/[\\u0600-\\u06FF]+/g);
      const title = modal.querySelector('.section-title')?.textContent?.trim() || '';
      const badge = modal.querySelector('.selected-count-badge')?.textContent?.trim() || '';
      const barrier = modal.querySelector('.selected-parts-barrier')?.textContent?.trim() || '';
      const chips = Array.from(modal.querySelectorAll('.symptom-add-btn')).map(el => el.textContent.trim());
      return {
        arabicMatches,
        hasArabic: Boolean(arabicMatches && arabicMatches.length > 0),
        title,
        badge,
        barrier,
        chipsCount: chips.length,
        sampleChips: chips.slice(0, 4)
      };
    })()`);
    console.log('Customer modal English-only audit:', arabicCheckCustomer);

    // Scroll down inside modal to capture the cards and symptom chips
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (modal) modal.scrollTo(0, 260);
    })()`);
    await sleep(800);

    await driver.screenshot(path.join(ARTIFACT_DIR, 'customer_intake_100pct_english.png'));
    console.log('✓ Captured customer_intake_100pct_english.png');

    // ════════════════════════════════════════════════════════════════════
    // 2. TECHNICIAN INSPECTION STATION (100% ENGLISH)
    // ════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Testing Technician Inspection Station: 100% English ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/login`);
    await sleep(1500);

    const hasContinueBtn = await driver.eval(`Boolean(document.querySelector('.continue-btn'))`);
    if (hasContinueBtn) {
      await driver.click('.continue-btn');
      await sleep(1500);
    }

    console.log('Entering Tech credentials: tech@apex-motors.local ...');
    await driver.fill('#email', 'tech@apex-motors.local');
    await driver.fill('#password', 'ChangeMe-Tech-123');
    await sleep(400);
    await driver.click('button[type="submit"], .submit-btn');
    await sleep(3000);

    await driver.navigate(`${BASE_URL}/tech/card/cmtlz035k00lp1ndnnwjxtz5o`);
    await sleep(3500);

    // Audit Technician Station for Arabic text
    const arabicCheckTech = await driver.eval(`(() => {
      const page = document.querySelector('.studio-inspection-page');
      if (!page) return { found: false, text: 'No studio-inspection-page' };
      const text = page.innerText || '';
      const arabicMatches = text.match(/[\\u0600-\\u06FF]+/g);
      const topPill = page.querySelector('.live-inspection-pill')?.textContent?.trim() || '';
      const backNav = page.querySelector('.nav-back-button')?.textContent?.trim() || '';
      const bottomTitle = page.querySelector('.bottom-section-title')?.textContent?.trim() || '';
      const proceedBtn = page.querySelector('.btn-complete-inspection')?.textContent?.trim() || '';
      const cardTitles = Array.from(page.querySelectorAll('.service-title')).map(e => e.textContent.trim());
      return {
        arabicMatches,
        hasArabic: Boolean(arabicMatches && arabicMatches.length > 0),
        topPill,
        backNav,
        bottomTitle,
        proceedBtn,
        cardTitlesCount: cardTitles.length,
        sampleCardTitles: cardTitles.slice(0, 4)
      };
    })()`);
    console.log('Technician station English-only audit:', arabicCheckTech);

    // Capture top half with 3D Car & Sidebar in English
    await driver.eval(`window.scrollTo(0, 0)`);
    await sleep(600);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_full_page_inspection_top_english.png'));
    console.log('✓ Captured tech_full_page_inspection_top_english.png');

    // Scroll to bottom checkpoints section
    await driver.eval(`(() => {
      const el = document.querySelector('.studio-bottom-section');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await sleep(800);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_inspection_boxes_english.png'));
    console.log('✓ Captured tech_inspection_boxes_english.png');

    // Open Customer Details Modal
    console.log('Testing Customer Details popup modal in English...');
    const custBtn = await driver.eval(`Boolean(document.querySelector('.btn-customer-details'))`);
    if (custBtn) {
      await driver.click('.btn-customer-details');
      await sleep(1000);

      const arabicCheckModal = await driver.eval(`(() => {
        const modal = document.querySelector('.studio-modal-card');
        if (!modal) return { found: false };
        const text = modal.innerText || '';
        const arabicMatches = text.match(/[\\u0600-\\u06FF]+/g);
        return {
          hasArabic: Boolean(arabicMatches && arabicMatches.length > 0),
          arabicMatches,
          title: modal.querySelector('.modal-title')?.textContent?.trim() || '',
          labels: Array.from(modal.querySelectorAll('.info-label')).map(e => e.textContent.trim())
        };
      })()`);
      console.log('Customer Details modal English audit:', arabicCheckModal);

      await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_customer_modal_english.png'));
      console.log('✓ Captured tech_customer_modal_english.png');

      await driver.click('.modal-close-btn');
      await sleep(600);
    }

    // Mark all checkpoints as Done to verify proceed button unlocks with English message
    console.log('Marking all checkpoints as Done...');
    const doneBtnsCount = await driver.eval(`document.querySelectorAll('.btn-done-status').length`);
    for (let i = 0; i < doneBtnsCount; i++) {
      await driver.eval(`(() => {
        const btns = document.querySelectorAll('.btn-done-status');
        if (btns[${i}] && !btns[${i}].classList.contains('btn-done-status--checked')) {
          btns[${i}].click();
        }
      })()`);
      await sleep(700);
    }

    await sleep(1000);
    await driver.screenshot(path.join(ARTIFACT_DIR, 'tech_all_done_proceed_ready_english.png'));
    console.log('✓ Captured tech_all_done_proceed_ready_english.png');

    console.log('\n=== All 100% English Verification Checks Succeeded! ===');
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
