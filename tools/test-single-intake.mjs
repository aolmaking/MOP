import { BrowserDriver } from './browser-driver.mjs';

async function run() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('Logging in as manager@precision-motors.local...');
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await new Promise(r => setTimeout(r, 1000));
  await driver.fill('input[type="email"], input[name="email"], #email', 'manager@precision-motors.local');
  await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Staff-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1500));

  await driver.navigate('http://localhost:4200/branch/intake');
  await new Promise(r => setTimeout(r, 1500));

  console.log('Step 1: Type in search');
  await driver.eval(`(() => {
    const input = document.querySelector('.search-input');
    if (input) {
      input.value = 'Tariq Mansour';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  console.log('Step 2: Click "Add as a new customer"');
  const clickedNewCust = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('new customer'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log('Clicked new customer:', clickedNewCust);
  await new Promise(r => setTimeout(r, 800));

  console.log('Step 3: Fill customer details');
  await driver.eval(`(() => {
    const inputs = document.querySelectorAll('.band .fields input');
    if (inputs.length >= 2) {
      inputs[0].value = 'Tariq Mansour';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '+201001112221';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      if (inputs[2]) {
        inputs[2].value = 'tariq.mansour@gmail.com';
        inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  })()`);
  await new Promise(r => setTimeout(r, 800));

  console.log('Step 4: Check vehicle section');
  const vehState = await driver.eval(`(() => {
    const bands = Array.from(document.querySelectorAll('.band-title')).map(b => b.innerText);
    const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText);
    return { bands, btns };
  })()`);
  console.log('Vehicle section state:', vehState);

  // Click "Another vehicle" if present
  const clickedNewVeh = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Another vehicle'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log('Clicked another vehicle:', clickedNewVeh);
  await new Promise(r => setTimeout(r, 800));

  console.log('Step 5: Fill vehicle inputs');
  const filledVeh = await driver.eval(`(() => {
    const bands = document.querySelectorAll('section.band');
    const vehBand = Array.from(bands).find(b => b.querySelector('.band-title')?.innerText.toUpperCase().includes('VEHICLE'));
    if (!vehBand) return { foundBand: false };
    const inputs = vehBand.querySelectorAll('input');
    if (inputs[0]) {
      inputs[0].value = 'PMC-701-EGY';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (inputs[1]) {
      inputs[1].value = 'WDDZF4JB0PA109283';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { foundBand: true, inputCount: inputs.length };
  })()`);
  console.log('Filled vehicle result:', filledVeh);
  await new Promise(r => setTimeout(r, 800));

  console.log('Step 6: Check complaint & submit state');
  const status = await driver.eval(`(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = 'Routine 15k service';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const missing = document.querySelector('.missing')?.innerText;
    const submitBtn = Array.from(document.querySelectorAll('section.confirm button')).find(b => b.innerText.includes('Book in'));
    return {
      missing,
      btnDisabled: submitBtn?.disabled,
      btnText: submitBtn?.innerText
    };
  })()`);
  console.log('Intake status:', status);

  if (!status.btnDisabled) {
    console.log('Step 7: Submit booking form');
    await driver.eval(`(() => {
      const submitBtn = Array.from(document.querySelectorAll('section.confirm button')).find(b => b.innerText.includes('Book in'));
      if (submitBtn) submitBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));

    const booked = await driver.eval(`(() => {
      const b = document.querySelector('.booked');
      return b ? b.innerText : null;
    })()`);
    console.log('Booking outcome:', booked);
  }

  await driver.close();
}

run();
