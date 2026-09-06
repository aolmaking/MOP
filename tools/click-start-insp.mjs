import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('Finding and clicking Start inspection button...');
  const clicked = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Start inspection'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked Start inspection button:', clicked);

  await new Promise(r => setTimeout(r, 2000));

  const missionText = await driver.eval(`document.querySelector('.mission')?.innerText`);
  console.log('Mission text after click:\n', missionText);

  const actionError = await driver.eval(`document.querySelector('.action-error')?.innerText`);
  console.log('Action error if any:', actionError);

  await driver.close();
}

main().catch(console.error);
