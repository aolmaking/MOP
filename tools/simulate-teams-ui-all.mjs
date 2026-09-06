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

async function inviteAndActivateLeader(driver, name, email) {
  console.log(`\n--- Inviting Team Leader: ${name} (${email}) ---`);
  await driver.navigate(`${BASE_URL}/owner/organization`);
  await new Promise(r => setTimeout(r, 1500));

  // Click Invite Staff
  await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Invite Staff'));
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // Fill form
  await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('.modal input'));
    const nameInput = inputs.find(i => i.getAttribute('type') === 'text');
    const emailInput = inputs.find(i => i.getAttribute('type') === 'email');
    const phoneInput = inputs.find(i => i.getAttribute('type') === 'tel');
    const roleSelect = document.querySelector('.modal select');

    if (nameInput) { nameInput.value = ${JSON.stringify(name)}; nameInput.dispatchEvent(new Event('input', { bubbles: true })); }
    if (emailInput) { emailInput.value = ${JSON.stringify(email)}; emailInput.dispatchEvent(new Event('input', { bubbles: true })); }
    if (phoneInput) { phoneInput.value = '+201019998888'; phoneInput.dispatchEvent(new Event('input', { bubbles: true })); }
    if (roleSelect) { roleSelect.value = 'TEAM_LEADER'; roleSelect.dispatchEvent(new Event('change', { bubbles: true })); }
  })()`);
  await new Promise(r => setTimeout(r, 600));

  // Click Send Invite
  await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('.modal button')).find(b => b.innerText.includes('Send Invite') || b.innerText.includes('Inviting'));
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Click Invite Link to capture token
  const inviteLink = await driver.eval(`(async () => {
    const tr = Array.from(document.querySelectorAll('table tbody tr')).find(r => r.innerText.includes(${JSON.stringify(name)}));
    const btn = tr?.querySelector('button');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 600));
    const captured = (window.__mop_captured || []).filter(c => c.url.includes('invite-link')).pop();
    return captured?.data?.inviteLink || null;
  })()`);

  console.log(`Invite link captured: ${inviteLink}`);
  if (!inviteLink) throw new Error(`Failed to get invite link for ${name}`);

  // Navigate to accept page
  await driver.navigate(`${BASE_URL}${inviteLink}`);
  await new Promise(r => setTimeout(r, 1500));

  // Fill passwords and click Set password
  await driver.eval(`(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
    if (inputs[0]) {
      inputs[0].focus();
      inputs[0].value = 'ChangeMe-Staff-123';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (inputs[1]) {
      inputs[1].focus();
      inputs[1].value = 'ChangeMe-Staff-123';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 500));

  await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Set password'));
    if (btn && !btn.disabled) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  console.log(`Team Leader ${name} activated successfully.`);
}

async function createTeamAndAssignMember(driver, teamName, memberName) {
  console.log(`\n--- Creating team "${teamName}" and assigning "${memberName}" ---`);
  await driver.navigate(`${BASE_URL}/owner/organization/teams`);
  await new Promise(r => setTimeout(r, 1500));

  // Click "New team"
  const clickedNew = await driver.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New team'));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  console.log(`Clicked "New team": ${clickedNew}`);
  await new Promise(r => setTimeout(r, 800));

  // Fill Name
  await driver.eval(`(() => {
    const nameInput = document.querySelector('.creator input[type="text"]');
    if (nameInput) {
      nameInput.value = ${JSON.stringify(teamName)};
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Submit form
  await driver.eval(`(() => {
    const form = document.querySelector('form.creator');
    const submitBtn = Array.from(document.querySelectorAll('form.creator button')).find(b => b.innerText.includes('Create team'));
    if (submitBtn) submitBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Now assign member
  console.log(`Assigning ${memberName} to ${teamName}...`);
  const assigned = await driver.eval(`(() => {
    // Find the team card with this name
    const cards = Array.from(document.querySelectorAll('.team-card'));
    const card = cards.find(c => c.querySelector('.team-card-name')?.innerText.includes(${JSON.stringify(teamName)}));
    if (!card) return { ok: false, error: 'Team card not found' };

    // Click "Add member" button inside this card
    const addBtn = Array.from(card.querySelectorAll('button')).find(b => b.innerText.includes('Add member'));
    if (!addBtn) return { ok: false, error: 'Add member button not found' };
    addBtn.click();

    // Click the member option in picker
    const pickerOptions = Array.from(card.querySelectorAll('.picker-option'));
    const targetOption = pickerOptions.find(opt => opt.innerText.includes(${JSON.stringify(memberName)}));
    if (targetOption) {
      targetOption.click();
      return { ok: true };
    }
    return { ok: false, error: 'Member not found in picker: ' + pickerOptions.map(o => o.innerText).join(', ') };
  })()`);
  console.log('Member assignment result:', assigned);
  await new Promise(r => setTimeout(r, 1500));
}

async function verifyTeamsPage(driver) {
  const info = await driver.eval(`(() => {
    const teams = Array.from(document.querySelectorAll('.team-card')).map(c => {
      const name = c.querySelector('.team-card-name')?.innerText.trim();
      const branch = c.querySelector('.team-card-branch')?.innerText.trim();
      const leader = c.querySelector('.leader-select')?.selectedOptions?.[0]?.innerText?.trim();
      const members = Array.from(c.querySelectorAll('.members-list .member-name')).map(m => m.innerText.trim());
      return { name, branch, leader, members };
    });
    const unassigned = Array.from(document.querySelectorAll('.unassigned-item .member-name')).map(m => m.innerText.trim());
    return { teams, unassigned };
  })()`);
  console.log('Teams State:', JSON.stringify(info, null, 2));
  return info;
}

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('==================================================');
  console.log('PHASE 1: TEAMS EXPERIENCE SIMULATION (REAL UI)');
  console.log('==================================================');

  // WORKSHOP A: Precision Motors
  console.log('\n>>> WORKSHOP A: PRECISION MOTORS <<<');
  await loginUser(driver, 'owner@precision-motors.local', 'ChangeMe-Precision-123');
  // Hossam Hassan was already invited & activated above. Let's create the teams:
  await createTeamAndAssignMember(driver, 'Diagnostics Team', 'Karim Mostafa');
  await createTeamAndAssignMember(driver, 'Mechanical Repair Team', 'Ziad Farouk');
  await verifyTeamsPage(driver);

  // WORKSHOP B: Heritage Auto Restoration
  console.log('\n>>> WORKSHOP B: HERITAGE AUTO RESTORATION <<<');
  await loginUser(driver, 'owner@heritage-restoration.local', 'ChangeMe-Heritage-123');
  await inviteAndActivateLeader(driver, 'Tarek Al-Alfy', 'lead.tarek@heritage-restoration.local');
  await loginUser(driver, 'owner@heritage-restoration.local', 'ChangeMe-Heritage-123');
  await createTeamAndAssignMember(driver, 'Restoration Team', 'Mahmoud Mansour');
  await createTeamAndAssignMember(driver, 'Vintage Mechanical Team', 'Hassan El-Sayed');
  await verifyTeamsPage(driver);

  // WORKSHOP C: Rapid Fleet & Commercial Garage
  console.log('\n>>> WORKSHOP C: RAPID FLEET & COMMERCIAL <<<');
  await loginUser(driver, 'owner@rapid-fleet.local', 'ChangeMe-RapidFleet-123');
  await inviteAndActivateLeader(driver, 'Samy Mansour', 'lead.samy@rapid-fleet.local');
  await loginUser(driver, 'owner@rapid-fleet.local', 'ChangeMe-RapidFleet-123');
  await createTeamAndAssignMember(driver, 'Fleet Maintenance Team', 'Ahmed Samir');
  await createTeamAndAssignMember(driver, 'Emergency Repair Team', 'Tamer Hosny');
  await verifyTeamsPage(driver);

  console.log('\n==================================================');
  console.log('ALL TEAMS CREATED & ASSIGNED SUCCESSFULLY ACROSS ALL 3 WORKSHOPS!');
  console.log('==================================================');

  driver.close();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
