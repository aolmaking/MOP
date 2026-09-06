import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Current URL:', await driver.getUrl());
  const text = await driver.getBodyText();
  console.log('Text on screen:');
  console.log(text.slice(0, 800));

  const captured = await driver.eval(`window.__mop_captured`);
  const publishReq = captured?.find(c => c.url?.includes('/workshops'));
  console.log('Publish Req Data:', JSON.stringify(publishReq?.data, null, 2));

  driver.close();
}

main().catch(console.error);
