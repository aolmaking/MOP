import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  const ARTIFACTS_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';

  // 1. Owner Login
  console.log('Testing Owner dashboard...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1200));
  await driver.fill('input[autocomplete="tel"], input[autocomplete="username"], input[type="tel"], input[type="text"]', 'owner-demo@apex-motors.local');
  await driver.fill('input[type="password"]', 'ChangeMe-Owner-123');
  await driver.clickText('Sign in', 'button');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(ARTIFACTS_DIR + '/owner_dashboard_refreshed.png');
  console.log('Saved owner_dashboard_refreshed.png');

  // 2. Owner Reports
  await driver.navigate('http://localhost:4200/owner/reports');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(ARTIFACTS_DIR + '/owner_reports_refreshed.png');
  console.log('Saved owner_reports_refreshed.png');

  // 3. Technician Login & Work Card
  console.log('Testing Technician view...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1200));
  await driver.fill('input[autocomplete="tel"], input[autocomplete="username"], input[type="tel"], input[type="text"]', 'tech@apex-motors.local');
  await driver.fill('input[type="password"]', 'ChangeMe-Tech-123');
  await driver.clickText('Sign in', 'button');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(ARTIFACTS_DIR + '/technician_work_refreshed.png');
  console.log('Saved technician_work_refreshed.png');

  driver.close();
  console.log('Spot check completed successfully!');
}

main().catch(err => {
  console.error('Error in spot check:', err);
  process.exit(1);
});
