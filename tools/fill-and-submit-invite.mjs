import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('1. Checking current page state...');
  const state = await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Set password') || b.innerText.includes('Setting'));
    return {
      url: window.location.href,
      inputs: inputs.map(i => ({ type: i.type, val: i.value })),
      btnText: btn?.innerText,
      btnDisabled: btn?.disabled
    };
  })()`);
  console.log('Current state:', state);

  console.log('2. Typing password with proper events and delay...');
  await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
    if (inputs[0]) {
      inputs[0].focus();
      inputs[0].value = 'ChangeMe-Staff-123';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 400));

  await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
    if (inputs[1]) {
      inputs[1].focus();
      inputs[1].value = 'ChangeMe-Staff-123';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  const afterType = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Set password') || b.innerText.includes('Setting'));
    return {
      btnDisabled: btn?.disabled,
      btnOuter: btn?.outerHTML
    };
  })()`);
  console.log('After type button state:', afterType);

  if (!afterType.btnDisabled) {
    console.log('3. Clicking button...');
    await driver.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Set password'));
      btn?.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));
    console.log('Resulting text:', await driver.eval(`document.body.innerText.slice(0, 400)`));
  }

  driver.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
