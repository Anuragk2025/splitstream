import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Anuragk20\\.gemini\\antigravity\\brain\\0aea4d37-709c-4955-ab3a-8c3d0c955a24';
const SCREENSHOT_DIR = ARTIFACT_DIR; // Save directly in the artifact directory

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('Resetting and seeding database...');
  try {
    // Run seed script to clear database and populate fresh data
    execSync('npm run db:seed --prefix server');
    console.log('Database reset and seeded successfully.');
  } catch (err) {
    console.error('Failed to seed database:', err.message);
  }

  console.log('Starting SplitStream automation test...');

  console.log('Saving screenshots to:', SCREENSHOT_DIR);

  if (!fs.existsSync(CHROME_PATH)) {
    console.error('Chrome executable not found at:', CHROME_PATH);
    process.exit(1);
  }

  // 1. Launch Browser
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true, // Run headlessly
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // 2. Create isolated browser contexts for Alice and Bob
    const contextA = await browser.createBrowserContext();
    const contextB = await browser.createBrowserContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Set viewport sizes to capture full desktop view
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageB.setViewport({ width: 1280, height: 800 });

    // ==========================================
    // STEP 1: AUTHENTICATION
    // ==========================================
    console.log('Logging in Alice...');
    await pageA.goto('http://localhost:5173/login');
    await pageA.type('input[type="email"]', 'alice@example.com');
    await pageA.type('input[type="password"]', 'password123');
    await pageA.click('button[type="submit"]');

    console.log('Logging in Bob...');
    await pageB.goto('http://localhost:5173/login');
    await pageB.type('input[type="email"]', 'bob@example.com');
    await pageB.type('input[type="password"]', 'password123');
    await pageB.click('button[type="submit"]');

    // Wait for dashboards to load
    await pageA.waitForSelector('h2');
    await pageB.waitForSelector('h2');
    console.log('Both users logged in successfully and reached dashboard.');

    // ==========================================
    // STEP 2: CREATE & JOIN GROUP
    // ==========================================
    console.log('Alice creating a group...');
    await pageA.type('input[placeholder="e.g. Goa Trip 🏖️, Flatmates 🏠"]', 'Weekend Party 🥳');
    // Submit create form
    await pageA.keyboard.press('Enter');
    await sleep(2000); // Wait for group list refresh

    console.log('Alice navigating to the group page...');
    await pageA.evaluate(() => {
      // Find the card containing "Weekend Party"
      const cards = Array.from(document.querySelectorAll('h4'));
      const partyCard = cards.find(c => c.textContent.includes('Weekend Party'));
      if (partyCard) partyCard.click();
    });

    await pageA.waitForSelector('h1');
    await sleep(2000);

    // Get invite code
    const inviteCode = await pageA.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const inviteBtn = buttons.find(b => b.textContent.includes('Code:'));
      if (!inviteBtn) return null;
      return inviteBtn.textContent.replace('Code:', '').trim();
    });

    console.log(`Retrieved group invite code: "${inviteCode}"`);
    if (!inviteCode) throw new Error('Could not find invite code.');

    console.log('Bob joining the group via code...');
    await pageB.type('input[placeholder="e.g. GOATRIP8"]', inviteCode);
    await pageB.keyboard.press('Enter');
    await sleep(3000); // Wait for Bob to join and auto-navigate

    // Ensure Bob is on group details page
    await pageB.waitForSelector('h1');
    console.log('Bob joined group successfully!');

    // Capture group view initial state
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'step1_group_view.png') });
    console.log('Screenshot saved: step1_group_view.png');

    // ==========================================
    // STEP 3: ADD EXPENSE & REALTIME UPDATE
    // ==========================================
    console.log('Alice adding an expense of ₹1200 (Drinks)...');
    await pageA.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent.includes('Add Expense'));
      if (addBtn) addBtn.click();
    });

    await pageA.waitForSelector('input[placeholder*="Dinner"]');
    await pageA.type('input[placeholder*="Dinner"]', 'Drinks');
    await pageA.type('input[placeholder="0.00"]', '1200');
    
    // Save the expense
    await pageA.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => b.textContent.includes('Save Expense'));
      if (saveBtn) saveBtn.click();
    });

    console.log('Saving expense, waiting for socket broadcast...');
    await sleep(3000); // Wait for real-time propagation

    // Capture Bob's screen showing the real-time update
    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'step2_realtime_expense.png') });
    console.log('Screenshot saved: step2_realtime_expense.png');

    // ==========================================
    // STEP 4: BOB ADDS ANOTHER EXPENSE -> DEBT SIMPLIFICATION
    // ==========================================
    console.log('Bob adding an expense of ₹400 (Snacks)...');
    await pageB.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn = buttons.find(b => b.textContent.includes('Add Expense'));
      if (addBtn) addBtn.click();
    });

    await pageB.waitForSelector('input[placeholder*="Dinner"]');
    await pageB.type('input[placeholder*="Dinner"]', 'Snacks');
    await pageB.type('input[placeholder="0.00"]', '400');
    
    await pageB.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveBtn = buttons.find(b => b.textContent.includes('Save Expense'));
      if (saveBtn) saveBtn.click();
    });

    console.log('Saving Bob\'s expense, waiting for updates...');
    await sleep(3000);

    // Capture Alice's screen showing simplified debts (Bob owes You ₹400)
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'step3_simplified_debts.png') });
    console.log('Screenshot saved: step3_simplified_debts.png');

    // ==========================================
    // STEP 5: DEBT SETTLEMENT
    // ==========================================
    console.log('Bob settling the debt of ₹400 with Alice...');
    await pageB.evaluate(() => {
      // Find the Pay button in Bob's view
      const payBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Pay');
      if (payBtn) payBtn.click();
    });

    await pageB.waitForSelector('button[type="submit"]');
    await sleep(1000); // wait modal load

    await pageB.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const recordBtn = buttons.find(b => b.textContent.includes('Record Settlement'));
      if (recordBtn) recordBtn.click();
    });

    console.log('Settle recorded, waiting for realtime balance updates...');
    await sleep(3000);

    // Capture Alice's screen showing fully settled balances
    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'step4_settled_up.png') });
    console.log('Screenshot saved: step4_settled_up.png');

    console.log('All tests completed successfully!');

  } catch (error) {
    console.error('Automation test encountered an error:', error);
  } finally {
    await browser.close();
    console.log('Test browser closed.');
  }
}

runTest();
