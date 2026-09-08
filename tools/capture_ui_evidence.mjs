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
  const profileDir = path.join(ARTIFACT_DIR, 'scratch', 'chrome-profile');
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--window-size=1440,900',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // Wait for Chrome to listen on port 9222
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

  console.log('Chrome connected. Fetching active page target...');
  const pages = await getJson('http://localhost:9222/json/list');
  const target = pages.find((p) => p.type === 'page') || pages[0];

  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('CDP connected!');

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
    console.log(`Saved screenshot: ${filename} (${buffer.length} bytes) - ${caption}`);
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
    console.log(`Cookies established for ${email} (role: ${loginRes.data.role})`);
    return loginRes.data;
  }

  // ==========================================
  // SCENARIO 1: STREAMLINED CUSTOMER PORTAL
  // ==========================================
  console.log('\n--- SCENARIO 1: CUSTOMER PORTAL & GARAGE ---');
  await setSessionCookiesFor('sara.nabil@customer.local', 'ChangeMe-Customer-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/customer' });
  await sleep(3500);
  await saveScreenshot('customer_portal_streamlined.png', 'Customer Portal: Live Tracking, Decisions, and Records ONLY');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/customer/garage' });
  await sleep(3500);
  await saveScreenshot('customer_garage_clean.png', 'Customer Garage: Records tabs with no add vehicle button');

  // ==========================================
  // SCENARIO 2: OPERATOR RECEPTION WORKSTATION
  // ==========================================
  console.log('\n--- SCENARIO 2: OPERATOR WORKSTATION ---');
  await setSessionCookiesFor('operator@apex-motors.local', 'ChangeMe-Operator-123');

  await cdp.send('Page.navigate', { url: 'http://localhost:4200/operator' });
  await sleep(4000);
  await saveScreenshot('operator_workstation_dashboard.png', 'Operator Workstation: Reception metrics, vehicle floor cards, and quick actions');

  // ==========================================
  // SCENARIO 3: LOCKED VEHICLE INTAKE MODAL
  // ==========================================
  console.log('\n--- SCENARIO 3: LOCKED VEHICLE INTAKE MODAL ---');
  // Click Report Issue on the first vehicle card
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.querySelector('.btn-intake-card');
        if (btn) btn.click();
      })()
    `,
  });
  await sleep(2500);

  // Select two subsystems (e.g. A/C and Brakes)
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const boxes = document.querySelectorAll('.subsystem-box');
        if (boxes.length >= 2) {
          boxes[0].click(); // A/C
          boxes[1].click(); // Brakes
        }
      })()
    `,
  });
  await sleep(1500);

  // Click symptom pills
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const pills = document.querySelectorAll('.symptom-pill');
        if (pills.length >= 2) {
          pills[0].click();
          pills[1].click();
        }
      })()
    `,
  });
  await sleep(1500);
  await saveScreenshot('operator_intake_modal_locked.png', 'Operator Intake Modal: Vehicle locked in header, 24 subsystems & symptoms with barrier dividers');

  // Scroll down to show symptoms with barrier dividers and complaint box
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const scrollBody = document.querySelector('.modal-scroll-body');
        if (scrollBody) {
          scrollBody.scrollTop = scrollBody.scrollHeight;
        }
      })()
    `,
  });
  await sleep(1500);
  await saveScreenshot('operator_intake_symptoms_scroll.png', 'Operator Intake Modal: 5 symptoms per selected subsystem with barrier dividers');

  // ==========================================
  // SCENARIO 4: OPERATOR OVER-THE-COUNTER POS
  // ==========================================
  console.log('\n--- SCENARIO 4: OPERATOR OVER-THE-COUNTER POS ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:4200/operator/pos' });
  await sleep(3500);
  await saveScreenshot('operator_pos_catalog.png', 'Operator Over-the-Counter POS with Return to Reception link');

  await cdp.close();
  chromeProc.kill();
  console.log('\nAll UI evidence captured successfully!');
}

main().catch((err) => {
  console.error('Fatal error in capture_ui_evidence:', err);
  process.exit(1);
});
