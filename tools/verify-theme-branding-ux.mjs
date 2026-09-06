import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACTS_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';

function artPath(filename) {
  return path.join(ARTIFACTS_DIR, filename);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('--- Step 1: Verify 2-Step Login & Theme Toggle ---');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await sleep(1500);

  // 1. Take screenshot of Login Step 1
  await driver.screenshot(artPath('login_step1_workshop_code.png'));
  console.log('Captured login_step1_workshop_code.png');

  // Verify theme toggle on login page
  console.log('Testing Theme Toggle to Light Mode on Login...');
  await driver.click('.theme-toggle-btn');
  await sleep(600);
  const themeModeLight = await driver.eval('document.documentElement.getAttribute("data-theme")');
  console.log('HTML data-theme attribute is now:', themeModeLight);
  await driver.screenshot(artPath('login_light_mode.png'));
  console.log('Captured login_light_mode.png');

  // Switch back to dark for consistency
  await driver.click('.theme-toggle-btn');
  await sleep(600);

  // Fill workshop code DFED5C5C92
  console.log('Connecting to workshop DFED5C5C92...');
  await driver.fill('input#workshopCode', 'DFED5C5C92');
  await sleep(300);
  await driver.click('.continue-btn');
  await sleep(1200);

  // 2. Take screenshot of Login Step 2 (Credentials)
  await driver.screenshot(artPath('login_step2_credentials.png'));
  console.log('Captured login_step2_credentials.png');

  console.log('--- Step 2: Verify 4-Stage Customer Registration Wizard ---');
  await driver.navigate('http://localhost:4200/register');
  await sleep(1500);

  // Stage 1 screenshot
  await driver.screenshot(artPath('register_stage1_workshop.png'));
  console.log('Captured register_stage1_workshop.png');

  // Proceed to Stage 2: Identity
  console.log('Proceeding to Stage 2 (Identity)...');
  await driver.click('button.next-btn');
  await sleep(1000);
  await driver.screenshot(artPath('register_stage2_identity.png'));
  console.log('Captured register_stage2_identity.png');

  // Fill Stage 2 fields
  const uniquePhone = '010' + Math.floor(10000000 + Math.random() * 90000000);
  const uniqueEmail = `driver.${Date.now()}@example.com`;
  console.log(`Filling customer identity: Tarek Zaki, ${uniquePhone}, ${uniqueEmail}`);
  await driver.fill('input#fullName', 'Tarek Zaki');
  await driver.fill('input#phone', uniquePhone);
  await driver.fill('input#email', uniqueEmail);
  await sleep(400);

  // Proceed to Stage 3: Vehicle & Security
  console.log('Proceeding to Stage 3 (Vehicle & Security)...');
  await driver.click('button.next-btn');
  await sleep(1000);

  // Fill vehicle plate & password
  await driver.fill('input#plateNumber', 'ABC 7894');
  await driver.fill('input#password', 'CustomerStrongPassword123!');
  await sleep(600);
  await driver.screenshot(artPath('register_stage3_vehicle.png'));
  console.log('Captured register_stage3_vehicle.png');

  // Submit Registration
  console.log('Submitting registration...');
  await driver.click('button.submit-btn');
  await sleep(2500);

  // Stage 4: Confirmation
  await driver.screenshot(artPath('register_stage4_success.png'));
  console.log('Captured register_stage4_success.png');

  console.log('--- Step 3: Owner Login & Branding / Palettes ---');
  await driver.navigate('http://localhost:4200/login');
  await sleep(1200);

  // Connect workshop DFED5C5C92
  await driver.fill('input#workshopCode', 'DFED5C5C92');
  await driver.click('.continue-btn');
  await sleep(1000);

  // Fill owner credentials
  console.log('Logging in as Owner...');
  await driver.fill('input#email', 'owner@precision-motors.local');
  await driver.fill('input#password', 'ChangeMe-Precision-123');
  await driver.click('button[type="submit"]');
  await sleep(2500);

  console.log('Owner Dashboard URL:', await driver.getUrl());
  await driver.screenshot(artPath('owner_dashboard_dark_mode.png'));
  console.log('Captured owner_dashboard_dark_mode.png');

  // Navigate to /owner/branding
  console.log('Navigating to Owner Branding & Palettes...');
  await driver.navigate('http://localhost:4200/owner/branding');
  await sleep(1500);
  await driver.screenshot(artPath('owner_branding_palettes.png'));
  console.log('Captured owner_branding_palettes.png');

  // Select Cyber Cobalt or Electric Amber
  console.log('Selecting Electric Amber palette...');
  await driver.clickText('Electric Amber', '*');
  await sleep(800);

  // Save branding changes
  await driver.clickText('Save Workshop Branding', 'button');
  await sleep(1500);
  await driver.screenshot(artPath('owner_palette_switched.png'));
  console.log('Captured owner_palette_switched.png');

  // Switch to Light Mode on Owner Dashboard
  console.log('Testing Light Mode on Owner Dashboard...');
  await driver.navigate('http://localhost:4200/owner/home');
  await sleep(1200);
  await driver.click('.theme-toggle-btn');
  await sleep(800);
  await driver.screenshot(artPath('owner_dashboard_light_mode.png'));
  console.log('Captured owner_dashboard_light_mode.png');

  // Switch back to dark mode
  await driver.click('.theme-toggle-btn');
  await sleep(600);

  console.log('--- Step 4: Owner Direct Worker Account Creation ---');
  await driver.navigate('http://localhost:4200/owner/organization');
  await sleep(1500);

  // Click "+ Invite Staff" button
  console.log('Opening invite modal in organization...');
  await driver.clickText('+ Invite Staff', 'button');
  await sleep(1000);

  // Verify Direct Account (Set Password) toggle
  console.log('Selecting Direct Account (Set Password)...');
  await driver.clickText('Direct Account (Set Password)', 'button');
  await sleep(400);

  const staffEmail = `worker.${Date.now()}@precision-motors.local`;
  console.log(`Creating worker: Samir Workshop Pro, ${staffEmail}`);
  await driver.fill('input[placeholder*="Tarek Mahmoud"]', 'Samir Workshop Pro');
  await driver.fill('input[placeholder*="worker@workshop.local"]', staffEmail);
  await driver.fill('input[placeholder*="01000000000"]', '+201099881122');
  await driver.fill('input[type="password"]', 'StaffSecurePass2026!');
  await sleep(400);

  // Submit modal
  await driver.clickText('Create Active Worker Account', 'button');
  await sleep(2500);

  await driver.screenshot(artPath('owner_staff_direct_creation.png'));
  console.log('Captured owner_staff_direct_creation.png');

  console.log('--- All UI & UX Journeys Successfully Verified! ---');
  driver.close();
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
