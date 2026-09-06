import { BrowserDriver } from './browser-driver.mjs';

async function activateStaff(driver, staffIndex, staffName) {
  console.log(`\n--- Activating ${staffName} (row ${staffIndex}) ---`);
  // Navigate to /owner/organization
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1200));

  // Click "Invite link" on the row
  const clicked = await driver.eval(`(() => {
    const rows = document.querySelectorAll('tbody tr');
    const r = rows[${staffIndex}];
    if (!r) return false;
    const btn = Array.from(r.querySelectorAll('button')).find(b => b.innerText.includes('Invite link'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);

  if (!clicked) {
    console.log(`Could not find 'Invite link' button for row ${staffIndex}`);
    return;
  }

  await new Promise(r => setTimeout(r, 800));
  const inviteUrl = await driver.eval(`document.querySelector('.state a.link')?.href`);
  console.log(`Captured invite link for ${staffName}:`, inviteUrl);

  if (!inviteUrl) {
    console.log('No invite URL found in banner!');
    return;
  }

  // Navigate to invite URL
  await driver.navigate(inviteUrl);
  await new Promise(r => setTimeout(r, 1000));

  const heading = await driver.eval(`document.querySelector('h1')?.innerText`);
  console.log('Invite page heading:', heading);

  // Fill password
  await driver.fill('input[type="password"]', 'ChangeMe-Staff-123');
  await driver.eval(`(() => {
    const inputs = document.querySelectorAll('input[type="password"]');
    if (inputs.length > 1) {
      inputs[1].value = 'ChangeMe-Staff-123';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 400));
  await driver.click('button.primary');
  await new Promise(r => setTimeout(r, 1500));

  console.log(`Result text:`, (await driver.getBodyText()).slice(0, 200).replace(/\n/g, ' '));
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // First ensure logged in as owner
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', 'owner@precision-motors.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Precision-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  // Ziad Farouk (row 2)
  await activateStaff(driver, 2, 'Ziad Farouk');
  // Karim Mostafa (row 3)
  await activateStaff(driver, 3, 'Karim Mostafa');
  // Hany Adel (row 4)
  await activateStaff(driver, 4, 'Hany Adel');

  console.log('All staff activation completed successfully!');
  driver.close();
}

main().catch(console.error);
