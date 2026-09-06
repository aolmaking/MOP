import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1500));

  const text = await driver.getBodyText();
  console.log('Staff list on UI:');
  console.log(text);

  driver.close();
}

main().catch(console.error);
