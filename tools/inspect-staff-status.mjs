import { BrowserDriver } from './browser-driver.mjs';

async function checkStaff(driver, email, password, orgName) {
  console.log(`\n=== Staff Status for ${orgName} ===`);
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', email);
  await driver.fill('input[type="password"], input[name="password"], #password', password);
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1500));

  const staff = await driver.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.map(r => {
      const cells = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
      return {
        name: cells[0],
        role: cells[1],
        branch: cells[2],
        warehouse: cells[3],
        status: cells[4],
        actions: cells[5]
      };
    });
  })()`);

  console.table(staff);
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await checkStaff(driver, 'owner@precision-motors.local', 'ChangeMe-Precision-123', 'Precision Motors');
  await checkStaff(driver, 'owner@heritage-restoration.local', 'ChangeMe-Heritage-123', 'Heritage Auto Restoration');
  await checkStaff(driver, 'owner@rapid-fleet.local', 'ChangeMe-RapidFleet-123', 'Rapid Fleet & Commercial');

  driver.close();
}

main().catch(console.error);
