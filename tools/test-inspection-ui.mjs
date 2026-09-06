import { BrowserDriver } from './browser-driver.mjs';

const BASE_URL = 'http://localhost:4200';

async function run() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  try {
    console.log('--- Step 1: Login as Manager to book in test vehicle ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/login`);
    await new Promise(r => setTimeout(r, 1000));
    await driver.fill('input[type="email"], input[name="email"], #email', 'manager@precision-motors.local');
    await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Staff-123');
    await driver.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 1500));

    await driver.navigate(`${BASE_URL}/branch/intake`);
    await new Promise(r => setTimeout(r, 1500));

    // Reset draft if needed
    await driver.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Book in another') || x.innerText.includes('Start fresh'));
      if (b) b.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));

    // Search
    await driver.eval(`(() => {
      const input = document.querySelector('.search-input');
      if (input) {
        input.value = 'Ahmed User Tester';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Add new customer
    await driver.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('new customer'));
      if (b) b.click();
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Fill customer
    await driver.eval(`(() => {
      const bands = document.querySelectorAll('section.band');
      const custBand = Array.from(bands).find(b => b.querySelector('.band-title')?.innerText.toUpperCase().includes('CUSTOMER'));
      if (custBand) {
        const inputs = custBand.querySelectorAll('input');
        if (inputs[0]) { inputs[0].value = 'Ahmed User Tester'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
        if (inputs[1]) { inputs[1].value = '+201199887766'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
      }
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Another vehicle
    await driver.eval(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.includes('Another vehicle'));
      if (b) b.click();
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Fill vehicle
    await driver.eval(`(() => {
      const bands = document.querySelectorAll('section.band');
      const vehBand = Array.from(bands).find(b => b.querySelector('.band-title')?.innerText.toUpperCase().includes('VEHICLE'));
      if (vehBand) {
        const inputs = vehBand.querySelectorAll('input');
        if (inputs[0]) { inputs[0].value = 'INSP-999-EGY'; inputs[0].dispatchEvent(new Event('input', { bubbles: true })); }
        if (inputs[1]) { inputs[1].value = 'VIN999INSPECTION'; inputs[1].dispatchEvent(new Event('input', { bubbles: true })); }
      }
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Fill complaint and select Karim Mostafa
    await driver.eval(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = 'Brake noise on deceleration and vehicle pull to right';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const selects = document.querySelectorAll('section.band select');
      for (const select of selects) {
        const opt = Array.from(select.options).find(o => o.text.includes('Karim'));
        if (opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    })()`);
    await new Promise(r => setTimeout(r, 700));

    // Submit
    await driver.eval(`(() => {
      const submitBtn = Array.from(document.querySelectorAll('section.confirm button')).find(b => b.innerText.includes('Book in'));
      if (submitBtn && !submitBtn.disabled) submitBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2000));

    const bookedWoId = await driver.eval(`(() => {
      const id = document.querySelector('.booked-id mop-identifier');
      return id ? id.innerText.trim() : null;
    })()`);
    console.log('Booked test work order ID:', bookedWoId);

    // --- Step 2: Login as Technician Karim Mostafa ---
    console.log('\n--- Step 2: Login as Technician Karim Mostafa ---');
    await driver.clearCookies();
    await driver.navigate(`${BASE_URL}/login`);
    await new Promise(r => setTimeout(r, 1000));
    await driver.fill('input[type="email"], input[name="email"], #email', 'tech.karim@precision-motors.local');
    await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Staff-123');
    await driver.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 1500));

    console.log('Navigating to /tech/work...');
    await driver.navigate(`${BASE_URL}/tech/work`);
    await new Promise(r => setTimeout(r, 1500));

    const myWorkPage = await driver.eval(`(() => {
      const jobs = Array.from(document.querySelectorAll('.job, .card, .work-item, a')).map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') }));
      return { url: window.location.href, jobs: jobs.filter(j => j.href?.includes('/tech/work-orders/')) };
    })()`);
    console.log('My work jobs listed:', myWorkPage);

    console.log(`Navigating to work card /tech/card/${bookedWoId}...`);
    await driver.navigate(`${BASE_URL}/tech/card/${bookedWoId}`);
    await new Promise(r => setTimeout(r, 2000));

    // Check inspection UI state
    const inspInitialState = await driver.eval(`(() => {
      const mission = document.querySelector('.mission');
      const missionState = mission?.querySelector('.mission-state')?.innerText;
      const buttons = Array.from(mission ? mission.querySelectorAll('button') : []).map(b => ({ text: b.innerText, disabled: b.disabled }));
      const workflowNow = document.querySelector('.workflow-now')?.innerText;
      return { missionState, buttons, workflowNow };
    })()`);
    console.log('Initial Inspection UI State on Work Card:', inspInitialState);

    // Click "Start inspection"
    console.log('Clicking "Start inspection" button...');
    const clickStartResult = await driver.eval(`(() => {
      const startBtn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Start inspection'));
      if (startBtn) {
        startBtn.click();
        return { clicked: true };
      }
      return { clicked: false, availableButtons: Array.from(document.querySelectorAll('button')).map(b => b.innerText) };
    })()`);
    console.log('Click Start Result:', clickStartResult);
    await new Promise(r => setTimeout(r, 2000));

    // Check UI state after click
    const afterClickState = await driver.eval(`(() => {
      const mission = document.querySelector('.mission');
      const missionState = mission?.querySelector('.mission-state')?.innerText;
      const actionError = document.querySelector('.action-error')?.innerText;
      const buttons = Array.from(mission ? mission.querySelectorAll('button') : []).map(b => ({ text: b.innerText, disabled: b.disabled }));
      return { missionState, actionError, buttons };
    })()`);
    console.log('State After Clicking Start Inspection:', afterClickState);

    // Try logging a finding
    console.log('\nTesting "+ Log finding" form...');
    await driver.eval(`(() => {
      const logBtn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Log finding'));
      if (logBtn) logBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 600));

    const findingFormState = await driver.eval(`(() => {
      const textarea = document.querySelector('.mission textarea.fault-text');
      const askToggle = document.querySelector('.mission .ask-toggle input');
      const severityBtns = Array.from(document.querySelectorAll('.mission .tap--severity')).map(b => b.innerText);
      return { hasTextarea: !!textarea, hasAskToggle: !!askToggle, severityBtns };
    })()`);
    console.log('Finding Form State:', findingFormState);

    if (findingFormState.hasTextarea) {
      console.log('Filling finding details...');
      await driver.eval(`(() => {
        const textarea = document.querySelector('.mission textarea.fault-text');
        if (textarea) {
          textarea.value = 'Front right caliper guide pins seized causing uneven pad wear';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const medBtn = Array.from(document.querySelectorAll('.mission .tap--severity')).find(b => b.innerText.includes('HIGH'));
        if (medBtn) medBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 600));

      console.log('Clicking "Save finding"...');
      await driver.eval(`(() => {
        const saveBtn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Save finding'));
        if (saveBtn) saveBtn.click();
      })()`);
      await new Promise(r => setTimeout(r, 2000));

      const afterSaveFinding = await driver.eval(`(() => {
        const findings = Array.from(document.querySelectorAll('.finding-item')).map(f => f.innerText.replace(/\\n/g, ' '));
        const actionError = document.querySelector('.action-error')?.innerText;
        return { findings, actionError };
      })()`);
      console.log('After Saving Finding:', afterSaveFinding);
    }

    // Try Completing Inspection
    console.log('\nTesting Complete Inspection...');
    await driver.eval(`(() => {
      const odo = document.querySelector('.completion-input[placeholder*="54000"]');
      if (odo) {
        odo.value = '62500';
        odo.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const mins = document.querySelector('.completion-input[placeholder*="25"]');
      if (mins) {
        mins.value = '30';
        mins.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const note = document.querySelector('.completion-textarea');
      if (note) {
        note.value = 'Complete front suspension and brake check performed. Right caliper requires service.';
        note.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 600));

    console.log('Clicking "Complete inspection" button...');
    await driver.eval(`(() => {
      const compBtn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Complete inspection'));
      if (compBtn) compBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    const finalInspState = await driver.eval(`(() => {
      const mission = document.querySelector('.mission');
      const missionState = mission?.querySelector('.mission-state')?.innerText;
      const actionError = document.querySelector('.action-error')?.innerText;
      const repairLocked = document.querySelector('.mission-locked-banner')?.innerText;
      return { missionState, actionError, repairLocked };
    })()`);
    console.log('Final Inspection State on Work Card:', finalInspState);

  } catch (err) {
    console.error('Error testing inspection UI:', err);
  } finally {
    await driver.close();
  }
}

run();
