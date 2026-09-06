import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('1. Navigating to Owner Organization page...');
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Clicking "+ Invite Staff" button...');
  const clickedInvite = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Invite Staff'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked Invite Staff:', clickedInvite);
  await new Promise(r => setTimeout(r, 1000));

  console.log('3. Filling Invite form...');
  const fillResult = await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('.modal input'));
    const nameInput = inputs.find(i => i.getAttribute('type') === 'text');
    const emailInput = inputs.find(i => i.getAttribute('type') === 'email');
    const phoneInput = inputs.find(i => i.getAttribute('type') === 'tel');
    const roleSelect = document.querySelector('.modal select');

    if (!nameInput || !emailInput || !phoneInput || !roleSelect) {
      return { ok: false, error: 'Missing inputs in modal' };
    }

    nameInput.value = 'Hossam Hassan';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    emailInput.value = 'lead.hossam@precision-motors.local';
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));

    phoneInput.value = '+201019998888';
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));

    roleSelect.value = 'TEAM_LEADER';
    roleSelect.dispatchEvent(new Event('change', { bubbles: true }));

    return { ok: true };
  })()`);
  console.log('Fill Result:', fillResult);
  await new Promise(r => setTimeout(r, 800));

  console.log('4. Clicking "Send Invite"...');
  const clickedSend = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.modal button')).find(b => b.innerText.includes('Send Invite') || b.innerText.includes('Inviting'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  })()`);
  console.log('Clicked Send Invite:', clickedSend);
  await new Promise(r => setTimeout(r, 2500));

  console.log('5. Checking Staff list after invite...');
  const staffTable = await driver.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      return cells;
    });
    return rows;
  })()`);
  console.log('Staff Table rows:', staffTable);

  driver.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
