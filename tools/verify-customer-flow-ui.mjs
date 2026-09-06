import path from 'node:path';
import { BrowserDriver } from './browser-driver.mjs';

const BASE_URL = 'http://localhost:4200';
const ARTIFACTS_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const driver = new BrowserDriver(9222);
  console.log('Connecting to browser via CDP...');
  await driver.connect();
  console.log('Connected to browser.');

  try {
    // =========================================================================
    // FLOW 1: New Customer Registration with WhatsApp note & Car Panel Number
    // =========================================================================
    console.log('\n--- FLOW 1: Testing New Customer Registration via Real UI ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/register`);
    await sleep(1500);

    // Step 1: Workshop code
    console.log('Submitting workshop code DFED5C5C92...');
    await driver.fill('input[autocomplete="off"]', 'DFED5C5C92');
    await driver.clickText('Continue', 'button');
    await sleep(1500);

    // Verify form rendered with WhatsApp hint and Car panel field
    const formText = await driver.getBodyText();
    if (!formText.includes('WhatsApp')) {
      throw new Error('WhatsApp hint missing from registration form!');
    }
    if (!formText.includes('Car panel / plate number')) {
      throw new Error('Car panel / plate number field missing from registration form!');
    }
    console.log('Verified: Registration form displays WhatsApp requirement and Car panel number field.');

    // Screenshot 1: Registration form
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_registration_form.png'));
    console.log('Saved screenshot: customer_registration_form.png');

    // Fill form
    const testPhone = `+201099${Math.floor(100000 + Math.random() * 900000)}`;
    const car1 = `CAI-${Math.floor(1000 + Math.random() * 9000)}`;
    console.log(`Registering with Phone: ${testPhone}, Car 1: ${car1}...`);

    await driver.fill('input[autocomplete="name"]', 'Tarek Zaki');
    await driver.fill('input[autocomplete="tel"]', testPhone);
    // Fill car plate number
    await driver.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const plateInput = inputs.find(i => i.placeholder && i.placeholder.includes('ABC-1234'));
      if (plateInput) {
        plateInput.focus();
        plateInput.value = ${JSON.stringify(car1)};
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        plateInput.dispatchEvent(new Event('change', { bubbles: true }));
        plateInput.blur();
      }
    })()`);
    await driver.fill('input[autocomplete="new-password"]', 'ChangeMe-Customer-123');
    await sleep(500);

    // Click Create account
    await driver.clickText('Create account', 'button');
    await sleep(2500);

    // Verify 'done' state
    const doneText = await driver.getBodyText();
    if (!doneText.includes('Your account is ready')) {
      throw new Error('Registration failed to reach ready state. Page text: ' + doneText.substring(0, 300));
    }
    console.log('Verified: Registration completed successfully! "Your account is ready".');
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_registration_done.png'));

    // Sign in to verify vehicle in portal
    console.log('Signing into Customer Portal to verify vehicle in My Assets...');
    await driver.clickText('Sign in', 'button');
    await sleep(1500);

    // In Login page
    await driver.fill('input[type="tel"], input[name="phone"], #phone, input[autocomplete="tel"], input[autocomplete="username"]', testPhone);
    await driver.fill('input[type="password"]', 'ChangeMe-Customer-123');
    await driver.clickText('Sign in', 'button');
    await sleep(2500);

    // Navigate to My Assets
    await driver.navigate(`${BASE_URL}/customer/assets`);
    await sleep(2000);

    const assetsText = await driver.getBodyText();
    console.log('My Assets page text:', assetsText.substring(0, 300));
    if (!assetsText.includes(car1)) {
      throw new Error(`Car 1 (${car1}) not found on My Assets page!`);
    }
    console.log(`Verified: Car 1 (${car1}) successfully displayed in Customer Portal!`);
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_portal_single_car.png'));

    // =========================================================================
    // FLOW 2: Duplicate Phone with DIFFERENT Car Panel Number & Confirmation Modal
    // =========================================================================
    console.log('\n--- FLOW 2: Testing Duplicate Phone + Different Car Modal Flow ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/register`);
    await sleep(1500);

    // Step 1: Workshop code
    await driver.fill('input[autocomplete="off"]', 'DFED5C5C92');
    await driver.clickText('Continue', 'button');
    await sleep(1500);

    const car2 = `ALX-${Math.floor(1000 + Math.random() * 9000)}`;
    console.log(`Registering again with SAME Phone: ${testPhone} and DIFFERENT Car 2: ${car2}...`);

    await driver.fill('input[autocomplete="name"]', 'Tarek Zaki');
    await driver.fill('input[autocomplete="tel"]', testPhone);
    // Fill car 2
    await driver.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const plateInput = inputs.find(i => i.placeholder && i.placeholder.includes('ABC-1234'));
      if (plateInput) {
        plateInput.focus();
        plateInput.value = ${JSON.stringify(car2)};
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        plateInput.dispatchEvent(new Event('change', { bubbles: true }));
        plateInput.blur();
      }
    })()`);
    await driver.fill('input[autocomplete="new-password"]', 'ChangeMe-Customer-123');
    await sleep(500);

    // Click Create account
    await driver.clickText('Create account', 'button');
    await sleep(2000);

    // Check for Verification Modal Dialog
    const modalCheck = await driver.eval(`(() => {
      const modal = document.querySelector('.modal-card');
      if (!modal) return null;
      return {
        title: modal.querySelector('.modal-title')?.innerText,
        prompt: modal.querySelector('.modal-prompt')?.innerText,
        summary: modal.querySelector('.modal-plates-summary')?.innerText,
      };
    })()`);

    console.log('Modal detection result:', modalCheck);
    if (!modalCheck) {
      const bodyText = await driver.getBodyText();
      throw new Error('Verification modal did not appear! Page content: ' + bodyText.substring(0, 300));
    }

    if (!modalCheck.prompt.includes('This number is already signed in before and the car panel number is different')) {
      throw new Error('Modal prompt does not match required message! Prompt: ' + modalCheck.prompt);
    }
    console.log('Verified: Verification modal appeared with exact required prompt:');
    console.log(modalCheck.prompt);

    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_different_car_modal.png'));
    console.log('Saved screenshot: customer_different_car_modal.png');

    // Click [Yes, this is my new car]
    console.log('Clicking "Yes, this is my new car"...');
    await driver.clickText('Yes, this is my new car', 'button');
    await sleep(2500);

    // Verify 'done' state reached
    const postModalText = await driver.getBodyText();
    if (!postModalText.includes('Your account is ready')) {
      throw new Error('Account ready state not reached after confirming new car! Text: ' + postModalText.substring(0, 300));
    }
    console.log('Verified: Submission succeeded after clicking YES!');
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'multi_vehicle_registered_done.png'));

    // Sign in and check My Assets has BOTH cars!
    console.log('Logging in to verify BOTH cars appear in Customer Portal My Assets...');
    await driver.clickText('Sign in', 'button');
    await sleep(1500);

    await driver.fill('input[type="tel"], input[name="phone"], #phone, input[autocomplete="tel"], input[autocomplete="username"]', testPhone);
    await driver.fill('input[type="password"]', 'ChangeMe-Customer-123');
    await driver.clickText('Sign in', 'button');
    await sleep(2500);

    await driver.navigate(`${BASE_URL}/customer/assets`);
    await sleep(2000);

    const multiAssetsText = await driver.getBodyText();
    console.log('Customer Portal Assets List:', multiAssetsText);

    const hasCar1 = multiAssetsText.includes(car1);
    const hasCar2 = multiAssetsText.includes(car2);

    if (!hasCar1 || !hasCar2) {
      throw new Error(`Customer Portal does NOT contain both cars! Car 1 (${car1}): ${hasCar1}, Car 2 (${car2}): ${hasCar2}`);
    }
    console.log(`SUCCESS! BOTH vehicles (${car1} and ${car2}) are actively linked to this customer and visible in My Assets!`);
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_portal_both_cars.png'));
    console.log('Saved screenshot: customer_portal_both_cars.png');

    // =========================================================================
    // FLOW 3: Customer Permission / Decision Request Display
    // =========================================================================
    console.log('\n--- FLOW 3: Testing Customer Permission / Decision Request Display ---');
    const decisionToken = 'demo-wait-cmtpmb8ob005pel85ofhj298u';
    await driver.navigate(`${BASE_URL}/decide/${decisionToken}`);
    await sleep(2000);

    const decisionPageContent = await driver.eval(`(() => {
      const banner = document.querySelector('.decision-vehicle-banner');
      const items = Array.from(document.querySelectorAll('.item')).map(item => ({
        name: item.querySelector('.item-name')?.innerText,
        inspectionFinding: item.querySelector('.finding-desc')?.innerText,
        pricing: item.querySelector('.repair-pricing-grid')?.innerText,
        total: item.querySelector('.tile-total')?.innerText,
      }));
      return {
        vehiclePlate: banner?.querySelector('.vehicle-plate-text')?.innerText,
        items,
        bodySnippet: document.body.innerText.substring(0, 500),
      };
    })()`);

    console.log('Decision Page Data:', JSON.stringify(decisionPageContent, null, 2));

    if (!decisionPageContent.vehiclePlate || !decisionPageContent.vehiclePlate.includes('DEMO-1188')) {
      throw new Error('Vehicle plate missing from decision vehicle banner! Found: ' + decisionPageContent.vehiclePlate);
    }
    console.log('Verified: Car Panel Number prominently displayed in banner: ' + decisionPageContent.vehiclePlate);

    if (!decisionPageContent.items || decisionPageContent.items.length === 0) {
      throw new Error('No decision items found on decision page!');
    }

    const firstItem = decisionPageContent.items[0];
    if (!firstItem.inspectionFinding) {
      throw new Error('Inspection problem finding missing on decision item!');
    }
    console.log('Verified: Inspection Problem Found: ' + firstItem.inspectionFinding);

    if (!firstItem.pricing) {
      throw new Error('Pricing breakdown (parts and fixing service) missing on decision item!');
    }
    console.log('Verified: Pricing breakdown: \n' + firstItem.pricing);

    await driver.screenshot(path.join(ARTIFACTS_DIR, 'customer_decision_permission_view.png'));
    console.log('Saved screenshot: customer_decision_permission_view.png');

    console.log('\n=============================================================');
    console.log('ALL REAL UI VERIFICATION FLOWS COMPLETED SUCCESSFULLY!');
    console.log('=============================================================');
  } finally {
    driver.close();
  }
}

run().catch(err => {
  console.error('\nUI VERIFICATION FAILED:', err);
  process.exit(1);
});
