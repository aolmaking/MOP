import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Current URL:', await driver.getUrl());
  console.log('Current Body:', (await driver.getBodyText()).slice(0, 500));

  // Let's test the platform login flow step by step
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1500));
  console.log('Login URL:', await driver.getUrl());

  const buttons = await driver.eval(`Array.from(document.querySelectorAll('button')).map(b => b.innerText)`);
  console.log('Buttons on login:', buttons);

  await driver.clickText('Platform Administrator? Sign in directly', 'button');
  await new Promise(r => setTimeout(r, 1000));
  console.log('After platform link click, URL:', await driver.getUrl());

  await driver.fill('#email', 'platform-admin@mop.local');
  await driver.fill('#password', 'ChangeMe-Platform-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 3000));

  console.log('After submit, URL:', await driver.getUrl());
  console.log('After submit, Body:', (await driver.getBodyText()).slice(0, 500));

  await driver.navigate('http://localhost:4200/platform/workshops/new');
  await new Promise(r => setTimeout(r, 3000));
  console.log('New workshop page, URL:', await driver.getUrl());
  console.log('New workshop page, Body:', (await driver.getBodyText()).slice(0, 1000));
  const html = await driver.eval(`document.body.innerHTML`);
  console.log('HTML snippet:', html.slice(0, 1000));
}

main().catch(console.error);
