import { BrowserDriver } from './browser-driver.mjs';

async function run() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Connected to Chrome');

  // Navigate and clear cookies to start fresh
  await driver.navigate('http://localhost:4200/login');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  
  // Login as platform admin
  await driver.fill('input[type="email"], input[name="email"], #email', 'platform-admin@mop.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Platform-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));
  
  console.log('Current URL after login:', await driver.getUrl());

  // Navigate to /platform/workshops/new
  await driver.navigate('http://localhost:4200/platform/workshops/new');
  await new Promise(r => setTimeout(r, 1500));
  console.log('Current URL at onboarding:', await driver.getUrl());

  const heading = await driver.eval(`document.querySelector('.onb-stage-title')?.innerText || document.querySelector('h1')?.innerText`);
  console.log('Heading on onboarding page:', heading);

  const plans = await driver.eval(`Array.from(document.querySelectorAll('.onb-plan')).map(el => el.innerText)`);
  console.log('Plans available:', plans);

  const categories = await driver.eval(`Array.from(document.querySelectorAll('.onb-choice')).map(el => el.innerText)`);
  console.log('Categories available:', categories);

  driver.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
