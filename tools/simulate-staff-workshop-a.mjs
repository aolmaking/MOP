import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  console.log('--- Inviting Staff for Workshop A (Precision Motors) ---');
  await driver.navigate('http://localhost:4200/owner/organization');
  await new Promise(r => setTimeout(r, 1000));

  // Staff members to invite
  const staffList = [
    {
      fullName: 'Omar Khaled',
      email: 'manager@precision-motors.local',
      phone: '+201011110001',
      role: 'BRANCH_MANAGER',
      branchScope: 'cmtpnbvqf005j8q6f0wtmo4db',
    },
    {
      fullName: 'Laila Hassan',
      email: 'reception@precision-motors.local',
      phone: '+201011110002',
      role: 'RECEPTIONIST',
    },
    {
      fullName: 'Ziad Farouk',
      email: 'tech.ziad@precision-motors.local',
      phone: '+201011110003',
      role: 'TECHNICIAN',
    },
    {
      fullName: 'Karim Mostafa',
      email: 'tech.karim@precision-motors.local',
      phone: '+201011110004',
      role: 'TECHNICIAN',
    },
    {
      fullName: 'Hany Adel',
      email: 'inventory@precision-motors.local',
      phone: '+201011110005',
      role: 'INVENTORY_MANAGER',
      warehouseScope: 'cmtpnbvqj005n8q6f9d97zyv8, cmtpnbvqw005t8q6fvvtrxn85, cmtpnbvqy005z8q6f3rpi1wxy',
    },
    {
      fullName: 'Noha Samy',
      email: 'finance@precision-motors.local',
      phone: '+201011110006',
      role: 'FINANCE',
    }
  ];

  const inviteTokens = [];

  for (const staff of staffList) {
    console.log(`Inviting ${staff.fullName} (${staff.role})...`);
    // Click "+ Invite Staff"
    await driver.clickText('+ Invite Staff', 'button');
    await new Promise(r => setTimeout(r, 500));

    // Fill modal fields
    // Find inputs in modal
    await driver.eval(`(() => {
      const modal = document.querySelector('.modal');
      const inputs = modal.querySelectorAll('input');
      // name, email, phone
      inputs[0].value = ${JSON.stringify(staff.fullName)};
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      inputs[1].value = ${JSON.stringify(staff.email)};
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

      inputs[2].value = ${JSON.stringify(staff.phone)};
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

      const select = modal.querySelector('select');
      select.value = ${JSON.stringify(staff.role)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await new Promise(r => setTimeout(r, 400));

    if (staff.branchScope) {
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const inputs = Array.from(modal.querySelectorAll('input'));
        const branchInput = inputs.find(inp => inp.parentElement?.innerText?.includes('Branch scope'));
        if (branchInput) {
          branchInput.value = ${JSON.stringify(staff.branchScope)};
          branchInput.dispatchEvent(new Event('input', { bubbles: true }));
          branchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 300));
    }

    if (staff.warehouseScope) {
      await driver.eval(`(() => {
        const modal = document.querySelector('.modal');
        const inputs = Array.from(modal.querySelectorAll('input'));
        const whInput = inputs.find(inp => inp.parentElement?.innerText?.includes('Warehouse scope'));
        if (whInput) {
          whInput.value = ${JSON.stringify(staff.warehouseScope)};
          whInput.dispatchEvent(new Event('input', { bubbles: true }));
          whInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await new Promise(r => setTimeout(r, 300));
    }

    // Submit modal
    await driver.clickText('Send invite', 'button');
    await new Promise(r => setTimeout(r, 1500));

    // Capture response
    const captured = await driver.eval(`window.__mop_captured`);
    const staffRes = captured?.reverse().find(c => c.url?.includes('/organization/staff') && c.data?.inviteLink);
    if (staffRes?.data?.inviteLink) {
      console.log(`Invite link for ${staff.email}:`, staffRes.data.inviteLink);
      inviteTokens.push({ email: staff.email, link: staffRes.data.inviteLink });
    } else {
      console.log(`Warning: could not capture inviteLink for ${staff.email}`);
    }
  }

  console.log(`Successfully invited ${inviteTokens.length} staff members.`);

  // Now accept invites for all staff members
  for (const item of inviteTokens) {
    console.log(`Accepting invite for ${item.email}...`);
    await driver.navigate(`http://localhost:4200${item.link}`);
    await new Promise(r => setTimeout(r, 800));

    await driver.fill('input[type="password"]', 'ChangeMe-Staff-123');
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      if (inputs.length > 1) {
        inputs[1].value = 'ChangeMe-Staff-123';
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 400));
    await driver.click('button.primary');
    await new Promise(r => setTimeout(r, 1200));
    console.log(`Password set for ${item.email}`);
  }

  console.log('All Workshop A staff accounts activated!');
  driver.close();
}

main().catch(console.error);
