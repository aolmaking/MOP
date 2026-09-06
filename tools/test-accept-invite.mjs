import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('1. Navigating to /owner/organization...');
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Getting invite link by clicking "Invite link" on Hossam Hassan...');
  // We can intercept the fetch or call getInviteLink
  const link = await driver.eval(`(async () => {
    const btn = Array.from(document.querySelectorAll('table tbody tr')).find(tr => tr.innerText.includes('Hossam Hassan'))?.querySelector('button');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 600));
    // Let's get the captured fetch
    const captured = (window.__mop_captured || []).find(c => c.url.includes('invite-link'));
    if (captured && captured.data?.inviteLink) return captured.data.inviteLink;
    return null;
  })()`);
  console.log('Obtained invite link:', link);

  if (link) {
    console.log('2. Navigating to accept invite page:', `http://localhost:4200${link}`);
    await driver.navigate(`http://localhost:4200${link}`);
    await new Promise(r => setTimeout(r, 1500));

    const pageText = await driver.eval(`document.body.innerText`);
    console.log('Accept page preview:\n', pageText.slice(0, 400));

    console.log('3. Filling password and accepting invite...');
    const acceptRes = await driver.eval(`(() => {
      const pwdInputs = Array.from(document.querySelectorAll('input[type="password"]'));
      if (pwdInputs.length < 2) return { ok: false, error: 'Expected 2 password inputs' };
      
      pwdInputs[0].value = 'ChangeMe-Staff-123';
      pwdInputs[0].dispatchEvent(new Event('input', { bubbles: true }));

      pwdInputs[1].value = 'ChangeMe-Staff-123';
      pwdInputs[1].dispatchEvent(new Event('input', { bubbles: true }));

      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Set password'));
      if (btn) {
        btn.click();
        return { ok: true };
      }
      return { ok: false, error: 'No Set password button found' };
    })()`);
    console.log('Accept result:', acceptRes);
    await new Promise(r => setTimeout(r, 2000));
    console.log('Current URL / text after accept:', await driver.eval(`document.body.innerText.slice(0, 300)`));
  }

  driver.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
