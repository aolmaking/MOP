import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('Navigating to Owner Organization page...');
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1500));

  // Get staff from API or evaluate
  const staff = await driver.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.map(r => {
      const cells = r.querySelectorAll('td');
      const btn = r.querySelector('button');
      return {
        name: cells[0]?.innerText.trim(),
        role: cells[1]?.innerText.trim(),
        hasInviteBtn: Array.from(r.querySelectorAll('button')).some(b => b.innerText.includes('Invite link'))
      };
    });
  })()`);

  console.log('Staff found on screen:', staff);

  // For each staff member with 'hasInviteBtn', click "Invite link" and capture the link
  const rowsCount = await driver.eval(`document.querySelectorAll('tbody tr').length`);
  const inviteLinks = [];

  for (let i = 0; i < rowsCount; i++) {
    const rowInfo = await driver.eval(`(() => {
      const r = document.querySelectorAll('tbody tr')[${i}];
      const name = r.querySelectorAll('td')[0]?.innerText.trim();
      const inviteBtn = Array.from(r.querySelectorAll('button')).find(b => b.innerText.includes('Invite link'));
      if (inviteBtn) {
        inviteBtn.click();
        return { name, clicked: true };
      }
      return { name, clicked: false };
    })()`);

    if (rowInfo?.clicked) {
      await new Promise(r => setTimeout(r, 600));
      const linkHref = await driver.eval(`document.querySelector('.state a.link')?.href`);
      if (linkHref) {
        console.log(`Captured invite link for ${rowInfo.name}:`, linkHref);
        inviteLinks.push({ name: rowInfo.name, link: linkHref });
      } else {
        console.log(`Could not find banner for ${rowInfo.name}`);
      }
    }
  }

  // Now accept the invite for each
  for (const item of inviteLinks) {
    console.log(`Setting password for ${item.name}...`);
    await driver.navigate(item.link);
    await new Promise(r => setTimeout(r, 1000));

    await driver.fill('input[type="password"]', 'ChangeMe-Staff-123');
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      if (inputs.length > 1) {
        inputs[1].value = 'ChangeMe-Staff-123';
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 400));
    await driver.click('button.primary');
    await new Promise(r => setTimeout(r, 1200));
    console.log(`Password set successfully for ${item.name}!`);
  }

  console.log('All remaining staff successfully activated!');
  driver.close();
}

main().catch(console.error);
