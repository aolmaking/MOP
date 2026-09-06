import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  await driver.navigate('http://localhost:4200/inventory/items/cmtpo2g2v000yrnkyzczj7mlw');
  await new Promise(r => setTimeout(r, 1200));

  const apiData = await driver.eval(`(async () => {
    const res = await fetch('/api/v1/inventory/items/cmtpo2g2v000yrnkyzczj7mlw');
    const data = await res.json();
    return data;
  })()`);

  console.log('API Response:', JSON.stringify(apiData, null, 2));

  driver.close();
}

main().catch(console.error);
