import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('1. Clearing cookies & storage...');
  await driver.clearCookies();

  console.log('2. Navigating to login...');
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1200));

  console.log('3. Filling login form for Precision Motors Owner...');
  await driver.fill('input[type="email"], input[name="email"], #email', 'owner@precision-motors.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Precision-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  console.log('4. Navigating to Owner Teams page: http://localhost:4200/owner/organization/teams');
  await driver.navigate('http://localhost:4200/owner/organization/teams');
  await new Promise(r => setTimeout(r, 2000));

  const pageInfo = await driver.eval(`(() => {
    return {
      url: window.location.href,
      title: document.title,
      h1: document.querySelector('h1')?.innerText,
      bodyText: document.body.innerText.slice(0, 600),
      hasTeamsTable: !!document.querySelector('.data-table'),
      hasCreateBtn: !!Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create Team') || b.innerText.includes('Team')),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean)
    };
  })()`);

  console.log('Page Info:', pageInfo);
  driver.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
