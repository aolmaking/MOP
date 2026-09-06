import { BrowserDriver } from './browser-driver.mjs';

async function run() {
  const driver = new BrowserDriver();
  try {
    console.log('Connecting to browser...');
    await driver.connect();
    console.log('Connected! Navigating to http://localhost:4200/login ...');
    await driver.navigate('http://localhost:4200/login', 3000);
    
    console.log('Current URL:', await driver.getUrl());
    const initialText = await driver.getBodyText();
    console.log('Initial Text snippet:', initialText.slice(0, 200).replace(/\n/g, ' '));
    
    // Fill login form
    console.log('Filling login form...');
    await driver.fill('input[type="email"], input[name="email"], #email', 'manager@apex-motors.local');
    await driver.fill('input[type="password"], input[name="password"], #password', 'ChangeMe-Manager-123');
    
    console.log('Clicking sign in button...');
    await driver.click('button[type="submit"]');
    
    await new Promise(r => setTimeout(r, 4000));
    console.log('Post-login URL:', await driver.getUrl());
    const postLoginText = await driver.getBodyText();
    console.log('Post-login Text snippet:', postLoginText.slice(0, 300).replace(/\n/g, ' '));
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    driver.close();
  }
}

run();
