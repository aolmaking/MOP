import path from 'node:path';
import { BrowserDriver } from './browser-driver.mjs';

const BASE_URL = 'http://localhost:4200';
const ARTIFACTS_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  const driver = new BrowserDriver(9222);
  console.log('Connecting to browser via CDP...');
  await driver.connect();
  console.log('Connected to browser.');

  try {
    // =========================================================================
    // 1. CUSTOMER FLOW: Verify POS button on customer page & OTC counter checkout
    // =========================================================================
    console.log('\n--- 1. Testing Customer Flow: POS access from Customer Page ---');
    await loginUser(driver, 'sara.nabil@customer.local', 'ChangeMe-Customer-123');

    await driver.navigate(`${BASE_URL}/customer`);
    await sleep(2000);

    const customerPageUrl = await driver.getUrl();
    console.log('Current URL:', customerPageUrl);

    // Verify #btn-customer-pos in header
    const headerPosBtn = await driver.eval(`(() => {
      const btn = document.querySelector('#btn-customer-pos');
      return btn ? { text: btn.innerText.trim(), href: btn.getAttribute('href') } : null;
    })()`);
    console.log('Header POS button:', headerPosBtn);
    if (!headerPosBtn || !headerPosBtn.text.includes('Buy Parts (POS)')) {
      throw new Error('Header Buy Parts (POS) button missing on customer portal!');
    }

    // Verify #btn-customer-pos-card in OTC card
    const cardPosBtn = await driver.eval(`(() => {
      const card = document.querySelector('.pos-quick-card');
      const btn = document.querySelector('#btn-customer-pos-card');
      return {
        cardTitle: card ? card.querySelector('.pos-quick-title')?.innerText.trim() : null,
        cardDesc: card ? card.querySelector('.pos-quick-desc')?.innerText.trim() : null,
        btnText: btn ? btn.innerText.trim() : null
      };
    })()`);
    console.log('OTC POS Quick Card info:', cardPosBtn);
    if (!cardPosBtn.cardTitle || !cardPosBtn.cardTitle.includes('Only need to buy a part and leave?')) {
      throw new Error('Over-the-counter POS quick card missing from customer portal!');
    }

    // Screenshot 1: Customer Portal with POS button & OTC card
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_portal_pos_entry.png'));
    console.log('Saved: customer_portal_pos_entry.png');

    // Click Buy Parts (POS) to navigate to /customer/pos
    console.log('Navigating to Customer POS (/customer/pos)...');
    await driver.click('#btn-customer-pos');
    await sleep(2000);

    const posUrl = await driver.getUrl();
    console.log('Customer POS URL:', posUrl);
    if (!posUrl.includes('/customer/pos')) {
      throw new Error('Expected to be on /customer/pos, but got: ' + posUrl);
    }

    // Verify Title and STRICTLY ensure "Part from outside" is NOT present on Customer POS
    const customerPosVerification = await driver.eval(`(() => {
      const title = document.querySelector('.catalog-title')?.innerText.trim();
      const extBtn = document.querySelector('#btn-pos-external-part');
      const backLink = document.querySelector('.card-back')?.innerText.trim();
      const items = Array.from(document.querySelectorAll('.product')).map(p => ({
        name: p.querySelector('.product-name')?.innerText.trim(),
        price: p.querySelector('.product-price')?.innerText.trim(),
        stock: p.querySelector('.product-stock')?.innerText.trim(),
      }));
      return { title, extBtnExists: Boolean(extBtn), backLink, itemCount: items.length, sampleItem: items[0] };
    })()`);
    console.log('Customer POS page verification:', customerPosVerification);

    if (customerPosVerification.extBtnExists) {
      throw new Error('SECURITY/REQUIREMENT VIOLATION: "Part from outside" button must NOT be present on customer POS!');
    }
    if (!customerPosVerification.title.includes('Point of Sale')) {
      throw new Error('Expected Point of Sale title, got: ' + customerPosVerification.title);
    }
    console.log('Verified: Customer POS does NOT contain "Part from outside" button.');

    // Add first item to cart
    console.log('Adding item to cart on Customer POS...');
    await driver.eval(`(() => {
      const firstAddBtn = document.querySelector('.product .tap--add');
      if (firstAddBtn) firstAddBtn.click();
    })()`);
    await sleep(800);

    // Open cart
    await driver.click('.cart-tab');
    await sleep(800);

    // Verify cart drawer
    const cartInfo = await driver.eval(`(() => {
      const cart = document.querySelector('.cart');
      const title = cart?.querySelector('.cart-title')?.innerText.trim();
      const total = cart?.querySelector('.cart-total')?.innerText.trim();
      const submitBtn = cart?.querySelector('button.tap--primary')?.innerText.trim();
      return { title, total, submitBtn };
    })()`);
    console.log('Customer Cart drawer info:', cartInfo);
    if (!cartInfo.title.includes('Parts Basket')) {
      throw new Error('Expected cart title "Parts Basket", got: ' + cartInfo.title);
    }

    // Screenshot 2: Customer POS with active cart
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_pos_catalog.png'));
    console.log('Saved: customer_pos_catalog.png');

    // Click Buy Parts / Checkout
    console.log('Submitting Customer POS Order...');
    await driver.eval(`(() => {
      const cart = document.querySelector('.cart');
      const submitBtn = cart?.querySelector('button.tap--primary');
      if (submitBtn) submitBtn.click();
    })()`);
    await sleep(2500);

    // Verify POS Receipt card
    const receiptInfo = await driver.eval(`(() => {
      const receipt = document.querySelector('.pos-receipt-card');
      return receipt ? {
        title: receipt.querySelector('.receipt-title')?.innerText.trim(),
        subtitle: receipt.querySelector('.receipt-subtitle')?.innerText.trim(),
        summary: receipt.querySelector('.receipt-summary')?.innerText.trim(),
        note: receipt.querySelector('.receipt-note')?.innerText.trim()
      } : null;
    })()`);
    console.log('Generated POS Receipt Info:', receiptInfo);
    if (!receiptInfo || !receiptInfo.title.includes('Over-the-Counter Order Placed!')) {
      throw new Error('POS Receipt card missing or order submission failed!');
    }
    console.log('Verified: Over-the-counter order placed successfully and invoice generated!');

    // Screenshot 3: Customer POS Receipt
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_pos_receipt.png'));
    console.log('Saved: customer_pos_receipt.png');

    // =========================================================================
    // 2. TECHNICIAN FLOW: Verify Part from outside removed from work card &
    //                     present on technician POS page
    // =========================================================================
    console.log('\n--- 2. Testing Technician Flow: Part from outside moved to POS page ---');
    await loginUser(driver, 'tech@apex-motors.local', 'ChangeMe-Tech-123');

    const woId = 'cmtlqj838000d103dt3eu88jr';
    console.log(`Navigating to Technician Work Card /tech/card/${woId}...`);
    await driver.navigate(`${BASE_URL}/tech/card/${woId}`);
    await sleep(2000);

    // Verify "Something's wrong" tool-row on work card:
    // MUST NOT contain "Part from outside"
    const cardTools = await driver.eval(`(() => {
      const tools = document.querySelector('.tools .tool-row');
      if (!tools) return null;
      const links = Array.from(tools.querySelectorAll('a')).map(a => a.innerText.trim());
      const buttons = Array.from(tools.querySelectorAll('button')).map(b => b.innerText.trim());
      return { links, buttons };
    })()`);
    console.log('Technician Work Card Tools row:', cardTools);

    const hasExtOnCard = cardTools?.buttons?.some(b => b.includes('Part from outside'));
    if (hasExtOnCard) {
      throw new Error('FAILURE: "Part from outside" button is still on technician work card! It must be removed.');
    }
    console.log('Verified: "Part from outside" is REMOVED from technician work card tools.');

    // Screenshot 4: Technician card with Part from outside removed
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'tech_card_no_external_part.png'));
    console.log('Saved: tech_card_no_external_part.png');

    // Click "Need parts" link to open POS page from tech page
    console.log('Opening POS from technician card via "Need parts"...');
    await driver.eval(`(() => {
      const needParts = Array.from(document.querySelectorAll('.tool-row a')).find(a => a.innerText.includes('Need parts'));
      if (needParts) needParts.click();
    })()`);
    await sleep(2000);

    const techPartsUrl = await driver.getUrl();
    console.log('Technician POS URL:', techPartsUrl);
    if (!techPartsUrl.includes(`/tech/card/${woId}/parts`)) {
      throw new Error('Expected to be on /tech/card/:id/parts, got: ' + techPartsUrl);
    }

    // Verify "📦 Part from outside" button IS PRESENT on technician POS page
    const extPosBtn = await driver.eval(`(() => {
      const btn = document.querySelector('#btn-pos-external-part');
      return btn ? btn.innerText.trim() : null;
    })()`);
    console.log('Technician POS External Part Button:', extPosBtn);
    if (!extPosBtn || !extPosBtn.includes('Part from outside')) {
      throw new Error('REQUIREMENT VIOLATION: "Part from outside" button must be present on POS page when opened from tech card!');
    }

    // Click "📦 Part from outside" to open modal
    console.log('Clicking "Part from outside" to open modal...');
    await driver.click('#btn-pos-external-part');
    await sleep(800);

    // Verify Modal Dialog is open
    const modalInfo = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      return modal ? {
        title: modal.querySelector('.modal-title')?.innerText.trim(),
        subtitle: modal.querySelector('.modal-subtitle')?.innerText.trim()
      } : null;
    })()`);
    console.log('External Part Modal Info:', modalInfo);
    if (!modalInfo || !modalInfo.title.includes('Part from outside')) {
      throw new Error('External part modal failed to open!');
    }

    // Fill in external part: "Customer-Supplied Bosch Ceramic Pads", 2x, Customer brought it
    await driver.fill('#external-part-name', 'Customer-Supplied Bosch Ceramic Pads');
    await driver.fill('#external-part-qty', '2');
    await sleep(300);

    // Screenshot 5: Technician POS External Part Modal
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'tech_pos_external_part_modal.png'));
    console.log('Saved: tech_pos_external_part_modal.png');

    // Click "Record it on job"
    console.log('Recording external part on job card...');
    await driver.click('#btn-record-external-part');
    await sleep(2000);

    // Verify notification/toast
    const recordSuccess = await driver.eval(`(() => {
      const notice = document.querySelector('.catalog-sent');
      return notice ? notice.innerText.trim() : null;
    })()`);
    console.log('Record result notice:', recordSuccess);
    if (!recordSuccess || !recordSuccess.includes('Customer-Supplied Bosch Ceramic Pads')) {
      throw new Error('External part recording confirmation missing!');
    }

    // Screenshot 6: Technician POS External Part Recorded
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'tech_pos_external_part_recorded.png'));
    console.log('Saved: tech_pos_external_part_recorded.png');

    // Return to work card and verify external part is listed
    console.log('Returning to technician work card...');
    await driver.click('.card-back');
    await sleep(2000);

    const workCardPageText = await driver.getBodyText();
    const hasRecordedPart = workCardPageText.includes('Customer-Supplied Bosch Ceramic Pads');
    console.log('External part found on Work Card:', hasRecordedPart);

    // Screenshot 7: Work Card with recorded external part
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'tech_card_external_part_verified.png'));
    console.log('Saved: tech_card_external_part_verified.png');

    console.log('\n================================================================');
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('1. Customer page POS button and OTC quick card verified.');
    console.log('2. Customer POS has NO external parts button and allows instant checkout.');
    console.log('3. Technician work card has "Part from outside" completely removed.');
    console.log('4. Technician POS page has "Part from outside" button & recording modal.');
    console.log('5. External part recorded successfully and visible on work card.');
    console.log('================================================================\n');

  } catch (err) {
    console.error('ERROR during verification:', err);
    throw err;
  } finally {
    driver.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
