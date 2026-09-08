import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  await driver.navigate('http://localhost:4200/tech');
  await new Promise(r => setTimeout(r, 2000));
  const queue = await driver.eval(`
    Array.from(document.querySelectorAll('.queue-link')).map(a => ({
      href: a.getAttribute('href'),
      badge: a.querySelector('.queue-state-badge-outside')?.textContent?.trim(),
      plate: a.querySelector('.queue-plate')?.textContent?.trim()
    }))
  `);
  console.log('Technician assigned queue items:', JSON.stringify(queue, null, 2));

  const activeJob = await driver.eval(`
    document.querySelector('.now-state-badge-outside')?.textContent?.trim()
  `);
  console.log('Active in-bay job:', activeJob);

  await driver.close();
}

main().catch(console.error);
