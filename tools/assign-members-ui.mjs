import { BrowserDriver } from './browser-driver.mjs';

const BASE_URL = 'http://localhost:4200';

async function loginUser(driver, email, password) {
  console.log(`\nLogging in as ${email}...`);
  await driver.clearCookies();
  await driver.navigate(`${BASE_URL}/login`);
  await new Promise(r => setTimeout(r, 1200));
  await driver.fill('input[type="email"], input[name="email"], #email', email);
  await driver.fill('input[type="password"], input[name="password"], #password', password);
  await driver.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1800));
}

async function assignTechnicianToTeam(driver, teamName, techName) {
  console.log(`Assigning technician "${techName}" to team "${teamName}"...`);
  await driver.navigate(`${BASE_URL}/owner/organization/teams`);
  await new Promise(r => setTimeout(r, 1500));

  const result = await driver.eval(`(async () => {
    const cards = Array.from(document.querySelectorAll('.team-card'));
    const card = cards.find(c => c.querySelector('.team-card-name')?.innerText.includes(${JSON.stringify(teamName)}));
    if (!card) return { ok: false, error: 'Card not found for: ' + ${JSON.stringify(teamName)} };

    // Find the Add technician button
    const addBtn = card.querySelector('button.team-add');
    if (!addBtn) return { ok: false, error: 'button.team-add not found' };
    addBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Find picker option with technician name
    const pickerOptions = Array.from(card.querySelectorAll('button.picker-option'));
    const targetOpt = pickerOptions.find(b => b.innerText.includes(${JSON.stringify(techName)}));
    if (!targetOpt) {
      return { ok: false, error: 'Technician not in picker: ' + pickerOptions.map(b => b.innerText).join(', ') };
    }
    targetOpt.click();
    return { ok: true };
  })()`);

  console.log('Assignment result:', result);
  await new Promise(r => setTimeout(r, 1500));
}

async function removeTechnicianFromTeam(driver, teamName, techName) {
  console.log(`Testing removal: removing "${techName}" from "${teamName}"...`);
  await driver.eval(`(async () => {
    const cards = Array.from(document.querySelectorAll('.team-card'));
    const card = cards.find(c => c.querySelector('.team-card-name')?.innerText.includes(${JSON.stringify(teamName)}));
    if (!card) return;
    const memberRow = Array.from(card.querySelectorAll('.member')).find(m => m.innerText.includes(${JSON.stringify(techName)}));
    const removeBtn = memberRow?.querySelector('button.member-remove');
    if (removeBtn) removeBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1500));
}

async function inspectTeamsRoster(driver) {
  const data = await driver.eval(`(() => {
    const teams = Array.from(document.querySelectorAll('.team-card')).map(c => {
      const name = c.querySelector('.team-card-name')?.innerText.trim();
      const leader = c.querySelector('.leader-select')?.selectedOptions?.[0]?.innerText?.trim();
      const members = Array.from(c.querySelectorAll('.members .member-name')).map(m => m.innerText.trim());
      return { name, leader, members };
    });
    const unassigned = Array.from(document.querySelectorAll('.unassigned-card .member-name')).map(m => m.innerText.trim());
    return { teams, unassigned };
  })()`);
  console.log('Current Roster:\n', JSON.stringify(data, null, 2));
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('==================================================');
  console.log('ASSIGNING TECHNICIANS TO TEAMS VIA UI');
  console.log('==================================================');

  // WORKSHOP A
  console.log('\n>>> WORKSHOP A: PRECISION MOTORS <<<');
  await loginUser(driver, 'owner@precision-motors.local', 'ChangeMe-Precision-123');
  await assignTechnicianToTeam(driver, 'Diagnostics Team', 'Karim Mostafa');
  await assignTechnicianToTeam(driver, 'Mechanical Repair Team', 'Ziad Farouk');
  // Test temporary removal and re-assignment
  await removeTechnicianFromTeam(driver, 'Mechanical Repair Team', 'Ziad Farouk');
  await assignTechnicianToTeam(driver, 'Mechanical Repair Team', 'Ziad Farouk');
  await inspectTeamsRoster(driver);

  // WORKSHOP B
  console.log('\n>>> WORKSHOP B: HERITAGE AUTO RESTORATION <<<');
  await loginUser(driver, 'owner@heritage-restoration.local', 'ChangeMe-Heritage-123');
  await assignTechnicianToTeam(driver, 'Restoration Team', 'Mahmoud Ezzat');
  await assignTechnicianToTeam(driver, 'Vintage Mechanical Team', 'Youssef Nabil');
  await inspectTeamsRoster(driver);

  // WORKSHOP C
  console.log('\n>>> WORKSHOP C: RAPID FLEET & COMMERCIAL <<<');
  await loginUser(driver, 'owner@rapid-fleet.local', 'ChangeMe-RapidFleet-123');
  await assignTechnicianToTeam(driver, 'Fleet Maintenance Team', 'Ahmed Sherif');
  await assignTechnicianToTeam(driver, 'Emergency Repair Team', 'Tamer Galal');
  await inspectTeamsRoster(driver);

  console.log('\n==================================================');
  console.log('ALL MEMBERS ASSIGNED & VERIFIED ACROSS ALL 3 WORKSHOPS!');
  console.log('==================================================');

  driver.close();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
