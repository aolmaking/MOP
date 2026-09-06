import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1000));

  // Click Branches tab
  await driver.clickText('Branches', 'button');
  await new Promise(r => setTimeout(r, 500));
  console.log('Branches Tab Text:');
  console.log(await driver.getBodyText());

  // Click Warehouses tab
  await driver.clickText('Warehouses', 'button');
  await new Promise(r => setTimeout(r, 500));
  console.log('Warehouses Tab Text:');
  console.log(await driver.getBodyText());

  // Get infrastructure from captured requests
  const captured = await driver.eval(`window.__mop_captured`);
  const infraReq = captured?.reverse().find(c => c.url?.includes('/infrastructure'));
  console.log('Infrastructure data:', JSON.stringify(infraReq?.data, null, 2));

  driver.close();
}

main().catch(console.error);
