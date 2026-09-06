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

  try {
    console.log('\n--- Testing User Exact Input Case: Local Egyptian Phone "01000000000" ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/register`);
    await sleep(1500);

    // Workshop code
    console.log('Resolving workshop code DFED5C5C92...');
    await driver.fill('input[autocomplete="off"]', 'DFED5C5C92');
    await driver.clickText('Continue', 'button');
    await sleep(1500);

    // Fill form exactly as user did in screenshot:
    // Name: ahmedsalah
    // Phone: 01000000000 (or unique local phone to avoid collision if run multiple times)
    const localPhone = `0100${Math.floor(1000000 + Math.random() * 9000000)}`;
    const carPlate = `dkf344`;
    console.log(`Filling form with Full Name: "ahmedsalah", Phone: "${localPhone}", Plate: "${carPlate}"...`);

    await driver.fill('input[autocomplete="name"]', 'ahmedsalah');
    await driver.fill('input[autocomplete="tel"]', localPhone);
    
    // Fill plate number
    await driver.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const plateInput = inputs.find(i => i.placeholder && (i.placeholder.includes('ABC-1234') || i.placeholder.includes('plate')));
      if (plateInput) {
        plateInput.focus();
        plateInput.value = ${JSON.stringify(carPlate)};
        plateInput.dispatchEvent(new Event('input', { bubbles: true }));
        plateInput.dispatchEvent(new Event('change', { bubbles: true }));
        plateInput.blur();
      }
    })()`);

    await driver.fill('input[autocomplete="new-password"]', 'ChangeMe-Customer-123');
    await sleep(800);

    // Check that button is enabled and validation format text is shown
    const formState = await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create account'));
      const formatHint = document.querySelector('.hint--met')?.innerText;
      return {
        buttonDisabled: btn?.disabled,
        buttonText: btn?.innerText,
        formatHint,
      };
    })()`);

    console.log('Form state after typing local phone:', formState);
    if (formState.buttonDisabled) {
      throw new Error('Button is still disabled after typing valid local phone!');
    }

    await driver.screenshot(path.join(ARTIFACTS_DIR, 'user_case_form_ready.png'));
    console.log('Saved screenshot: user_case_form_ready.png');

    // Click "Create account"
    console.log('Clicking "Create account"...');
    await driver.clickText('Create account', 'button');
    await sleep(2500);

    const bodyAfterSubmit = await driver.getBodyText();
    console.log('Page text after submit:', bodyAfterSubmit.substring(0, 300));
    if (!bodyAfterSubmit.includes('Your account is ready')) {
      throw new Error('Registration failed! Page content: ' + bodyAfterSubmit.substring(0, 400));
    }
    console.log('Verified: Account created successfully with local phone number!');
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'user_case_created_success.png'));

    // Now test LOGIN using the EXACT local phone number (010...)
    console.log(`\nTesting Login using local phone number "${localPhone}"...`);
    await driver.clickText('Sign in', 'button');
    await sleep(1500);

    await driver.fill('input[type="tel"], input[name="phone"], #phone, input[autocomplete="tel"], input[autocomplete="username"]', localPhone);
    await driver.fill('input[type="password"]', 'ChangeMe-Customer-123');
    await driver.clickText('Sign in', 'button');
    await sleep(2500);

    // Verify Customer Portal login succeeded
    await driver.navigate(`${BASE_URL}/customer/assets`);
    await sleep(2000);

    const assetsPageText = await driver.getBodyText();
    console.log('Customer Assets text:', assetsPageText.substring(0, 300));
    if (!assetsPageText.toUpperCase().includes(carPlate.toUpperCase())) {
      throw new Error(`Car plate ${carPlate} not found on My Assets page!`);
    }

    console.log(`Verified: Customer logged in with local number ${localPhone} and car ${carPlate.toUpperCase()} is displayed!`);
    await driver.screenshot(path.join(ARTIFACTS_DIR, 'user_case_customer_portal.png'));

    console.log('\n=============================================================');
    console.log('ALL USER SCENARIO CHECKS PASSED 100%!');
    console.log('=============================================================');
  } finally {
    driver.close();
  }
}

run().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
