import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  // Login as Inventory Manager for Precision Motors
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', 'inventory@precision-motors.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Staff-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  // Navigate to /inventory/stock
  await driver.navigate('http://localhost:4200/inventory/stock');
  await new Promise(r => setTimeout(r, 1200));

  // Find the first item link
  const itemLink = await driver.eval(`document.querySelector('.cell-item a')?.href`);
  console.log('First item link:', itemLink);

  if (!itemLink) {
    console.log('No items found on stock page!');
    driver.close();
    return;
  }

  await driver.navigate(itemLink);
  await new Promise(r => setTimeout(r, 1500));

  // Click "+ Receive Stock"
  console.log('Clicking "+ Receive Stock"...');
  await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.item-head-actions button')).find(b => b.innerText.includes('Receive Stock'));
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Inspect warehouse options in modal
  const whOptions = await driver.eval(`(() => {
    const select = document.querySelector('.editor select');
    if (!select) return [];
    return Array.from(select.options).map(o => ({ value: o.value, text: o.text.trim() }));
  })()`);
  console.log('Warehouse options in modal:', whOptions);

  // Set quantity to 50
  await driver.eval(`(() => {
    const input = document.querySelector('.editor input[type="number"]');
    if (input) {
      input.value = '50';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);

  // Set notes
  await driver.eval(`(() => {
    const input = document.querySelector('.editor input[type="text"]');
    if (input) {
      input.value = 'Test supplier receipt PO-1001';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);

  // Click "Record Receipt"
  console.log('Clicking "Record Receipt"...');
  await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.editor-foot button')).find(b => b.innerText.includes('Record Receipt'));
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Read updated totals and movements
  const result = await driver.eval(`(() => {
    const totals = Array.from(document.querySelectorAll('.totals .total')).map(t => ({
      name: t.querySelector('dt')?.innerText.trim(),
      val: t.querySelector('.total-value')?.innerText.trim(),
    }));
    const movements = Array.from(document.querySelectorAll('.ledger tbody tr')).map(r => {
      const cells = Array.from(r.querySelectorAll('td')).map(c => c.innerText.trim());
      return {
        what: cells[0],
        where: cells[1],
        before: cells[2],
        change: cells[3],
        after: cells[4],
        why: cells[5],
        when: cells[6]
      };
    });
    return { totals, movements };
  })()`);

  console.log('Updated Totals:', result.totals);
  console.log('Ledger Movements:', result.movements);

  driver.close();
}

main().catch(console.error);
