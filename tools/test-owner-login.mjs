import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('Logging in as Tariq Al-Mansoor (Owner)...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));

  await driver.fill('input[type="email"], input[name="email"], #email', 'owner@precision-motors.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Precision-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  console.log('Post-login URL:', await driver.getUrl());
  const text = await driver.getBodyText();
  console.log('Page heading/text:');
  console.log(text.slice(0, 500));

  // Navigate to /owner/organization
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 2000));
  console.log('Organization URL:', await driver.getUrl());
  const orgText = await driver.getBodyText();
  console.log('Org page text snippet:');
  console.log(orgText.slice(0, 500));

  driver.close();
}

main().catch(console.error);
