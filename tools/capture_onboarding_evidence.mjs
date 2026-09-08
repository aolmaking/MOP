import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\ahmed\\.gemini\\antigravity-ide\\brain\\750b8a4c-2d06-422a-b6d3-87dbc63b9277';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function request(options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });
    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (err) => reject(err));
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) {
            cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            cb.resolve(msg.result);
          }
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function main() {
  console.log('--- LAUNCHING CHROME HEADLESS FOR ONBOARDING UI EVIDENCE ---');
  const chromeProc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,920',
      '--user-data-dir=' + path.join(ARTIFACT_DIR, 'scratch', 'chrome-profile-onb'),
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await sleep(2500);

  const versionData = await getJson('http://127.0.0.1:9222/json/version');
  console.log('Connected to Chrome DevTools Protocol:', versionData['webSocketDebuggerUrl']);

  const targets = await getJson('http://127.0.0.1:9222/json/list');
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Network.enable');

  async function saveScreenshot(filename, caption) {
    const { data: b64 } = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 100 });
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(b64, 'base64'));
    console.log(`Saved screenshot: ${filename} (${caption})`);
  }

  async function setSessionCookiesFor(email, password) {
    const loginRes = await request(
      {
        hostname: 'localhost',
        port: 4000,
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email, password }
    );
    if (loginRes.statusCode !== 200) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(loginRes.data)}`);
    }

    await cdp.send('Network.clearBrowserCookies');
    const cookies = loginRes.headers['set-cookie'] || [];
    for (const cookieStr of cookies) {
      const parts = cookieStr.split(';')[0].split('=');
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      await cdp.send('Network.setCookie', {
        name,
        value,
        domain: 'localhost',
        path: '/',
      });
    }
    console.log(`Cookies established for ${email} (role: ${loginRes.data.role})`);
    return loginRes.data;
  }

  // 1. Log in as Platform Super Admin
  await setSessionCookiesFor('platform-admin@mop.local', 'ChangeMe-Platform-123');

  // 2. Navigate to /platform/workshops/new
  console.log('\n--- NAVIGATING TO WORKSHOP ONBOARDING WIZARD ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:4200/platform/workshops/new' });
  await sleep(4000);

  // 3. Screen 1: Basic Information
  await saveScreenshot('onboarding_step1_identity.png', 'Step 1: Basic Information with Top Progress Stepper, Admin badge, and Dark Rail');

  // Fill in Workshop Name
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const nameInput = document.querySelector('input#identity-name, input[type="text"]');
        if (nameInput) {
          nameInput.value = 'Apex Performance Garage';
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `,
  });
  await sleep(1000);

  // Click Next button
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const nextBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Next');
        if (nextBtn) nextBtn.click();
      })()
    `,
  });
  await sleep(2500);

  // 4. Screen 2: Choose a Plan
  await saveScreenshot('onboarding_step2_plan.png', 'Step 2: Choose a Plan comparison cards (Starter, Professional, Enterprise)');

  // Select Professional plan and click Next
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const nextBtn = btns.find(b => b.textContent && b.textContent.trim() === 'Next');
        if (nextBtn) nextBtn.click();
      })()
    `,
  });
  await sleep(2500);

  // 5. Screen 3: Enable Capabilities
  await saveScreenshot('onboarding_step3_capabilities.png', 'Step 3: Enable Capabilities with interactive switches and consequence previews');

  // Jump directly to STRUCTURE stage (Step 7) using the rail
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const railBtns = Array.from(document.querySelectorAll('.onb-rail-step, .onb-step-dot'));
        const structBtn = railBtns.find(b => b.textContent && b.textContent.includes('Structure')) ||
                          document.querySelectorAll('.onb-rail-step')[6];
        if (structBtn) structBtn.click();
      })()
    `,
  });
  await sleep(3000);

  // 6. Screen 7: Structure & Inventory Topology Management
  await saveScreenshot('onboarding_step7_topology_overview.png', 'Step 7: Inventory & Branch Topology Management Stage with 1-Click Strategy Presets');

  // Click "Dedicated Stores (1:1)" Preset
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.topo-preset-btn'));
        const dedicatedBtn = btns.find(b => b.textContent && b.textContent.includes('Dedicated'));
        if (dedicatedBtn) dedicatedBtn.click();
      })()
    `,
  });
  await sleep(2000);

  // Scroll to show Branches and Stores Tables
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const table = document.querySelector('.topo-table');
        if (table) table.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()
    `,
  });
  await sleep(1500);
  await saveScreenshot('onboarding_step7_tables.png', 'Step 7: Branches and Warehouses Tables with Add and Edit actions');

  // Click "Central Hub (1:N)" Preset
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('.topo-preset-btn'));
        const centralBtn = btns.find(b => b.textContent && b.textContent.includes('Central Hub'));
        if (centralBtn) centralBtn.click();
      })()
    `,
  });
  await sleep(2000);

  // Add another branch to demonstrate multi-branch serving
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const addBranchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Add Branch'));
        if (addBranchBtn) addBranchBtn.click();
      })()
    `,
  });
  await sleep(1000);

  // Fill in Branch Modal
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const nameInput = document.querySelector('#modal-br-name');
        const codeInput = document.querySelector('#modal-br-code');
        const cityInput = document.querySelector('#modal-br-city');
        const addrInput = document.querySelector('#modal-br-address');
        if (nameInput) {
          nameInput.value = 'Giza High-Speed Depot';
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (codeInput) {
          codeInput.value = 'BR-GIZA';
          codeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (cityInput) {
          cityInput.value = 'Giza';
          cityInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (addrInput) {
          addrInput.value = '456 Pyramids Road';
          addrInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `,
  });
  await sleep(800);

  // Save Branch
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const saveBtn = document.querySelector('.btn-save');
        if (saveBtn) saveBtn.click();
      })()
    `,
  });
  await sleep(1500);

  // Scroll down to the Interactive Serving Matrix Grid
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const matrixSec = document.querySelector('.topo-matrix-section');
        if (matrixSec) matrixSec.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `,
  });
  await sleep(1500);

  // 7. Capture Serving Matrix Grid
  await saveScreenshot('onboarding_step7_serving_matrix.png', 'Step 7: Interactive Serving Matrix Grid linking Warehouses to Branches with Live Coverage');

  // Open "Add Store" modal to showcase custom store creation
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const addStoreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Add Store'));
        if (addStoreBtn) addStoreBtn.click();
      })()
    `,
  });
  await sleep(1500);

  // 8. Capture Add Store Modal
  await saveScreenshot('onboarding_step7_add_store_modal.png', 'Step 7: Add / Edit Parts Store Modal with Role Options and Branch Checklist');

  // Close Store modal
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const closeBtn = document.querySelector('.modal-close, .btn-cancel');
        if (closeBtn) closeBtn.click();
      })()
    `,
  });
  await sleep(1000);

  // Jump to Review stage
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const railBtns = Array.from(document.querySelectorAll('.onb-rail-step, .onb-step-dot'));
        const reviewBtn = railBtns.find(b => b.textContent && b.textContent.includes('Review')) ||
                          document.querySelectorAll('.onb-rail-step')[8];
        if (reviewBtn) reviewBtn.click();
      })()
    `,
  });
  await sleep(3000);

  // Scroll to Structure & Topology review card
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const reviewCard = document.querySelector('.onb-review-struct-summary');
        if (reviewCard) reviewCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `,
  });
  await sleep(1500);

  // 9. Capture Review Stage
  await saveScreenshot('onboarding_step9_review_topology.png', 'Step 9: Review & Confirm showing Structure & Topology configuration');

  await cdp.close();
  chromeProc.kill();
  console.log('\n--- ALL ONBOARDING UI EVIDENCE CAPTURED SUCCESSFULLY! ---');
}

main().catch((err) => {
  console.error('Fatal error in capture_onboarding_evidence:', err);
  process.exit(1);
});
