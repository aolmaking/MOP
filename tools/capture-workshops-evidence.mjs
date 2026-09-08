import { BrowserDriver } from './browser-driver.mjs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/ahmed/.gemini/antigravity-ide/brain/750b8a4c-2d06-422a-b6d3-87dbc63b9277';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();
  console.log('Connected to Chrome CDP on 9222');

  // 1. Apex EV & High Voltage Lab (Cobalt) - Login stage 2 with code 5BBD8BD60E
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await driver.waitForSelector('#workshopCode', 12000);
  await driver.fill('#workshopCode', '5BBD8BD60E');
  await driver.click('.continue-btn');
  await driver.waitForSelector('#email', 10000);
  await new Promise(r => setTimeout(r, 800));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'apex_login_cobalt.png'));
  console.log('Saved apex_login_cobalt.png');

  // Sign in as Apex Technician (Ziad Khalil)
  await driver.fill('#email', 'tech.hv@apex-ev-lab.local');
  await driver.fill('#password', 'Password-EV-Tech-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'apex_tech_station_consolidated.png'));
  console.log('Saved apex_tech_station_consolidated.png');

  // 2. Titan Diesel & Heavy Fleet Hub (Amber) - Login stage 2 with code 0D193047B0
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await driver.waitForSelector('#workshopCode', 12000);
  await driver.fill('#workshopCode', '0D193047B0');
  await driver.click('.continue-btn');
  await driver.waitForSelector('#email', 10000);
  await new Promise(r => setTimeout(r, 800));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'titan_login_amber.png'));
  console.log('Saved titan_login_amber.png');

  // Sign in as Titan Branch Manager (Ibrahim Galal)
  await driver.fill('#email', 'manager@titan-diesel-hub.local');
  await driver.fill('#password', 'Password-Titan-Mgr-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'titan_branch_workbench_consolidated.png'));
  console.log('Saved titan_branch_workbench_consolidated.png');

  // 3. Royale Bespoke & Exotic Studio (Violet) - Login stage 2 with code 322604846A
  await driver.clearCookies();
  await driver.navigate('http://localhost:4200/login');
  await driver.waitForSelector('#workshopCode', 12000);
  await driver.fill('#workshopCode', '322604846A');
  await driver.click('.continue-btn');
  await driver.waitForSelector('#email', 10000);
  await new Promise(r => setTimeout(r, 800));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'royale_login_violet.png'));
  console.log('Saved royale_login_violet.png');

  // Sign in as Royale Owner (Karim Farouk)
  await driver.fill('#email', 'owner@royale-exotic-studio.local');
  await driver.fill('#password', 'ChangeMe-Royale-123');
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));
  await driver.screenshot(path.join(ARTIFACT_DIR, 'royale_owner_studio_violet.png'));
  console.log('Saved royale_owner_studio_violet.png');

  console.log('All evidence screenshots captured!');
}

main().catch(console.error);
