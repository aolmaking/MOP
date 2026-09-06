import { BrowserDriver } from './browser-driver.mjs';

async function main() {
  const driver = new BrowserDriver(9222);
  await driver.connect();

  const tokens = [
    { name: 'Ziad Farouk', token: '24e1e41f90a0997162072bd8df925aae29b1b41434b7a38741cf60f97a08dbe1' },
    { name: 'Karim Mostafa', token: '1df4ca14c264a935237d638ed47cf16dd395ebefb8800d5cbccc6f3988926543' },
    { name: 'Hany Adel', token: 'd1ffbddb246be33d38667f6990c07340d706aec4776ab75183098988eacb1771' }
  ];

  for (const item of tokens) {
    console.log(`Setting password for ${item.name}...`);
    await driver.navigate(`http://localhost:4200/invite/accept?token=${item.token}`);
    await new Promise(r => setTimeout(r, 1200));

    console.log('Page heading:', await driver.eval(`document.querySelector('h1')?.innerText`));
    await driver.fill('input[type="password"]', 'ChangeMe-Staff-123');
    await driver.eval(`(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      if (inputs.length > 1) {
        inputs[1].value = 'ChangeMe-Staff-123';
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 500));
    await driver.click('button.primary');
    await new Promise(r => setTimeout(r, 1500));
    console.log(`Result text:`, (await driver.getBodyText()).slice(0, 200).replace(/\n/g, ' '));
  }

  console.log('Staff activation complete!');
  driver.close();
}

main().catch(console.error);
