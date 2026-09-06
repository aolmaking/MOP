import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver('9222');
  await driver.connect();

  console.log('--- Step 1: Click "+ Log finding" ---');
  const clickedLog = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Log finding'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log('Clicked Log finding:', clickedLog);
  await new Promise(r => setTimeout(r, 600));

  console.log('--- Step 2: Fill finding description and severity ---');
  await driver.eval(`(() => {
    const textarea = document.querySelector('.mission textarea.fault-text');
    if (textarea) {
      textarea.value = 'Front brake pads worn to 20%, rotors grooved';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const highBtn = Array.from(document.querySelectorAll('.mission .tap--severity')).find(b => b.innerText.includes('HIGH'));
    if (highBtn) highBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 600));

  console.log('--- Step 3: Click "Save finding" ---');
  const clickedSave = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Save finding'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log('Clicked Save finding:', clickedSave);
  await new Promise(r => setTimeout(r, 2000));

  const afterSaveText = await driver.eval(`document.querySelector('.mission-findings')?.innerText`);
  console.log('Findings section text after save:\n', afterSaveText);

  console.log('--- Step 4: Fill complete inspection fields ---');
  await driver.eval(`(() => {
    const odo = document.querySelector('.completion-input[placeholder*="54000"]');
    if (odo) {
      odo.value = '45000';
      odo.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const mins = document.querySelector('.completion-input[placeholder*="25"]');
    if (mins) {
      mins.value = '25';
      mins.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const note = document.querySelector('.completion-textarea');
    if (note) {
      note.value = 'Front brake wear verified. Safe to proceed with pad replacement.';
      note.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  console.log('--- Step 5: Click "Complete inspection" ---');
  const clickedComplete = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.mission button')).find(b => b.innerText.includes('Complete inspection'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log('Clicked Complete inspection:', clickedComplete);
  await new Promise(r => setTimeout(r, 2500));

  const missionAfterComplete = await driver.eval(`document.querySelector('.mission')?.innerText`);
  console.log('Mission text after Complete Inspection:\n', missionAfterComplete);

  const actionError = await driver.eval(`document.querySelector('.action-error')?.innerText`);
  console.log('Action error if any:', actionError);

  const workflowStrip = await driver.eval(`document.querySelector('app-workflow-strip')?.innerText`);
  console.log('Workflow strip text:\n', workflowStrip);

  await driver.close();
}

main().catch(console.error);
