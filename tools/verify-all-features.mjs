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
        const parsed = JSON.parse(event.data.toString());
        if (parsed.id && this.callbacks.has(parsed.id)) {
          const cb = this.callbacks.get(parsed.id);
          this.callbacks.delete(parsed.id);
          if (parsed.error) cb.reject(new Error(parsed.error.message));
          else cb.resolve(parsed.result);
        }
      });
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function main() {
  console.log('Launching headless Chrome on port 9222...');
  const profileDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-verify-profile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--window-size=1440,900',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 20; i++) {
    try {
      version = await getJson('http://localhost:9222/json/version');
      break;
    } catch {
      await sleep(500);
    }
  }

  if (!version) {
    throw new Error('Chrome did not respond on port 9222');
  }

  console.log('Chrome connected. Fetching page target...');
  const pages = await getJson('http://localhost:9222/json/list');
  const target = pages.find((p) => p.type === 'page') || pages[0];

  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  async function saveScreenshot(filename, caption) {
    const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    console.log(`[Screenshot Saved] ${filename} - ${caption}`);
    return fullPath;
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
    console.log(`Authenticated as ${email} (role: ${loginRes.data.role})`);
    return loginRes.data;
  }

  // =========================================================================
  // SCENARIO 1: ONBOARDING UI SPECIALISATIONS & WARNING PLACEMENT
  // =========================================================================
  console.log('\n=== SCENARIO 1: ONBOARDING IDENTITY & WARNING PLACEMENT ===');
  await setSessionCookiesFor('platform-admin@mop.local', 'ChangeMe-Platform-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/platform/workshops/new' });
  await sleep(3500);

  // Scroll down to view the UI Specialisations section (Palettes, Layout selector, and Live brand preview)
  await cdp.send('Runtime.evaluate', {
    expression: `window.scrollTo(0, 1100);`,
  });
  await sleep(1500);
  await saveScreenshot('onboarding_step1_ui_specialisations.png', 'Onboarding Identity: Theme Palettes, Navigation Shell Layouts, and Workshop Name Preview');

  // Navigate to Policies stage (step 4)
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const stepBtns = document.querySelectorAll('.onb-stage-link, .stage-btn, .stage-nav-item');
        for (const b of stepBtns) {
          if (b.textContent && b.textContent.includes('Policies')) {
            b.click();
            return;
          }
        }
      })()
    `,
  });
  await sleep(2500);

  // Scroll to bottom of Policies stage to verify warnings position immediately above footer
  await cdp.send('Runtime.evaluate', {
    expression: `window.scrollTo(0, document.body.scrollHeight);`,
  });
  await sleep(1500);
  await saveScreenshot('onboarding_policies_warning_at_bottom.png', 'Onboarding Policies: Warnings & Notes placed at bottom right before Back/Next footer');

  // =========================================================================
  // SCENARIO 2: OWNER ORGANIZATION TEAMS & 24 SUBSYSTEMS SPECIALIZATIONS
  // =========================================================================
  console.log('\n=== SCENARIO 2: OWNER TEAMS & 24-SUBSYSTEM SPECIALIZATIONS ===');
  await setSessionCookiesFor('owner@apex-motors.local', 'ChangeMe-Owner-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/owner/organization' });
  await sleep(3500);

  // Switch to Teams & Leaders tab
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = document.querySelectorAll('.tab');
        for (const t of tabs) {
          if (t.textContent && t.textContent.includes('Teams')) {
            t.click();
            return;
          }
        }
      })()
    `,
  });
  await sleep(2500);
  await saveScreenshot('owner_teams_and_leaders_tab.png', 'Owner Organization: Teams and Team Leaders tab with Photo 1 Capability Card replica');

  // Click "+ Create Team" button
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.getElementById('open-create-team-btn');
        if (btn) btn.click();
      })()
    `,
  });
  await sleep(2000);

  // Fill in Team Name, select Leader and 3 subsystems in the 24-grid
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const nameInput = document.querySelector('.modal-body input[type="text"]');
        if (nameInput) {
          nameInput.value = 'Powertrain & Brake Specialists';
          nameInput.dispatchEvent(new Event('input'));
        }
        const leaderSelect = document.querySelector('.modal-body select');
        if (leaderSelect && leaderSelect.options.length > 1) {
          leaderSelect.selectedIndex = 1;
          leaderSelect.dispatchEvent(new Event('change'));
        }
        const boxes = document.querySelectorAll('.subsystem-box');
        if (boxes.length >= 3) {
          boxes[0].click(); // Engine
          boxes[1].click(); // Transmission
          boxes[2].click(); // Brakes
        }
      })()
    `,
  });
  await sleep(1500);
  await saveScreenshot('owner_create_team_24_subsystems_modal.png', 'Create Team Modal: Canonical 24 Car Subsystems Grid replica (Photo 3)');

  // Save the new team
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const saveBtn = document.querySelector('.modal-footer .btn-primary');
        if (saveBtn) saveBtn.click();
      })()
    `,
  });
  await sleep(2500);

  // Switch to Staff tab
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = document.querySelectorAll('.tab');
        for (const t of tabs) {
          if (t.textContent && t.textContent.includes('Staff')) {
            t.click();
            return;
          }
        }
      })()
    `,
  });
  await sleep(2500);

  // Click Specializations button on technician row
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const specBtns = document.querySelectorAll('.btn-staff-specs');
        if (specBtns.length > 0) specBtns[0].click();
      })()
    `,
  });
  await sleep(2000);

  // Select 2 subsystems in the individual staff modal (Suspension, Steering)
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const boxes = document.querySelectorAll('.subsystem-box');
        if (boxes.length >= 8) {
          boxes[6].click(); // Suspension
          boxes[7].click(); // Steering
        }
      })()
    `,
  });
  await sleep(1500);
  await saveScreenshot('owner_individual_tech_specs_modal.png', 'Individual Technician Specializations Modal: 24 subsystems selector');

  // Save technician specializations
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const saveBtn = document.querySelector('.modal-footer .btn-primary');
        if (saveBtn) saveBtn.click();
      })()
    `,
  });
  await sleep(2500);

  // Capture updated staff list with newly assigned specialization badges
  await saveScreenshot('owner_staff_specializations_column.png', 'Owner Organization: Staff list with individual Specializations column and badges');

  // =========================================================================
  // SCENARIO 3: OWNER BRANDING (LAYOUT & PALETTE SWITCHER)
  // =========================================================================
  console.log('\n=== SCENARIO 3: OWNER BRANDING & LAYOUT ENFORCEMENT ===');
  await cdp.send('Page.navigate', { url: 'http://localhost:4200/owner/branding' });
  await sleep(3500);
  await saveScreenshot('owner_branding_layout_and_palette.png', 'Owner Branding: 6 Luxury Palettes and 3 Navigation Shell Layout Architectures');

  // =========================================================================
  // SCENARIO 4: MULTI-INVENTORY STOCK FILTER & INTER-WAREHOUSE TRANSFER
  // =========================================================================
  console.log('\n=== SCENARIO 4: INVENTORY STOCK & INTER-WAREHOUSE TRANSFER ===');
  await setSessionCookiesFor('inventory@apex-motors.local', 'ChangeMe-Inventory-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/inventory/stock' });
  await sleep(3500);
  await saveScreenshot('inventory_stock_warehouse_filter.png', 'Inventory Stock: Warehouse filter dropdown and ⇄ Transfer action triggers');

  // Open first item transfer modal via the transfer action button
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const transferLinks = document.querySelectorAll('.transfer-link, .btn-transfer-row');
        if (transferLinks.length > 0) transferLinks[0].click();
      })()
    `,
  });
  await sleep(2500);
  await saveScreenshot('inventory_inter_warehouse_transfer_modal.png', 'Inter-Warehouse Stock Transfer Modal: Source, Destination, Quantity and Notes');

  // Close transfer modal
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const closeBtn = document.querySelector('.modal-close, .btn-cancel');
        if (closeBtn) closeBtn.click();
      })()
    `,
  });
  await sleep(1500);

  // Navigate to Inventory Requests
  await cdp.send('Page.navigate', { url: 'http://localhost:4200/inventory/requests' });
  await sleep(3500);
  await saveScreenshot('inventory_requests_fulfillment_indicators.png', 'Inventory Requests: Direct Shelf vs Transfer-Required fulfillment indicators');

  // =========================================================================
  // SCENARIO 5: BRANCH OPERATIONS & SMART SPECIALIST RECOMMENDATIONS
  // =========================================================================
  console.log('\n=== SCENARIO 5: BRANCH WORK ORDERS & SMART SPECIALIST MATCH ===');
  await setSessionCookiesFor('manager@apex-motors.local', 'ChangeMe-Manager-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/branch/work-orders' });
  await sleep(3500);
  await saveScreenshot('branch_work_orders_specialist_match.png', 'Branch Operations: ⭐ Specialist Match recommendations on active work orders');

  await cdp.close();
  chromeProc.kill();
  console.log('\nAll End-to-End Visual Verification Screenshots Captured Successfully!');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
