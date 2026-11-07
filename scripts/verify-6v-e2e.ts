import { spawn, execSync } from 'child_process';
import path from 'path';
import axios from 'axios';
import { chromium } from 'playwright';
import fs from 'fs';

function killProcessTree(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
    } else {
      process.kill(-pid);
    }
  } catch {}
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6V: PLAYWRIGHT CHROMIUM E2E VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const API_PORT = '4000';
  const WEB_PORT = '3000';
  const isWin = process.platform === 'win32';
  const npmCmd = isWin ? 'npm.cmd' : 'npm';
  const screenshotsDir = path.resolve(process.cwd(), 'scripts/screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // 1. Boot API server
  console.log('--- 1. Booting API Server (Port ' + API_PORT + ') ---');
  const apiProcess = spawn('node', ['apps/api/dist/index.js'], {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, PORT: API_PORT },
    stdio: 'pipe',
  });

  apiProcess.stdout?.on('data', (d) => {
    // process.stdout.write(`[API] ${d}`);
  });
  apiProcess.stderr?.on('data', (d) => {
    process.stderr.write(`[API ERR] ${d}`);
  });

  let apiReady = false;
  for (let i = 0; i < 35; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await axios.get(`http://127.0.0.1:${API_PORT}/health/live`);
      if (res.status === 200) {
        apiReady = true;
        break;
      }
    } catch {}
  }

  if (!apiReady) {
    console.error('❌ API failed to become ready on port ' + API_PORT);
    killProcessTree(apiProcess.pid);
    process.exit(1);
  }
  console.log(`✓ API running on http://127.0.0.1:${API_PORT}`);

  // 2. Boot Next.js Web server
  console.log('\n--- 2. Booting Next.js Production Web Server (Port ' + WEB_PORT + ') ---');
  const webProcess = spawn(npmCmd, ['run', 'start', '--workspace=apps/web'], {
    cwd: path.resolve(process.cwd()),
    env: {
      ...process.env,
      PORT: WEB_PORT,
      NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
    },
    shell: isWin,
    stdio: 'pipe',
  });

  let webReady = false;
  for (let i = 0; i < 35; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await axios.get(`http://127.0.0.1:${WEB_PORT}`);
      if (res.status === 200) {
        webReady = true;
        break;
      }
    } catch {}
  }

  if (!webReady) {
    console.error('❌ Web frontend failed to start on port ' + WEB_PORT);
    killProcessTree(apiProcess.pid);
    killProcessTree(webProcess.pid);
    process.exit(1);
  }
  console.log(`✓ Next.js production web server running on http://127.0.0.1:${WEB_PORT}`);

  // 3. Launch Playwright Chromium
  console.log('\n--- 3. Launching Playwright Chromium Browser ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // Test A: Homepage Discovery (Category Grid & Popular Brands)
    // -------------------------------------------------------------
    console.log('\n--- Testing Homepage Discovery (Category Grid & Brand Pills) ---');
    await page.goto(`http://localhost:${WEB_PORT}`, { waitUntil: 'networkidle' });
    const homepageTitle = await page.title();
    console.log(`✓ Homepage title: "${homepageTitle}"`);

    // Check Browse by Category section
    const categoryCards = await page.$$('a[href*="/search?category="]');
    console.log(`✓ Category links found: ${categoryCards.length} (Expected >= 7)`);
    if (categoryCards.length < 7) {
      throw new Error(`Expected at least 7 category cards, found ${categoryCards.length}`);
    }

    // Check specific categories
    const bodyContent = await page.textContent('body');
    const expectedCategories = ['Smart Watches', 'Smartphones', 'Wireless Earbuds', 'Laptops', 'Tablets'];
    for (const cat of expectedCategories) {
      const found = bodyContent?.includes(cat);
      console.log(`   - Category "${cat}": ${found ? '✓' : '❌'}`);
      if (!found) throw new Error(`Category "${cat}" not found in page body`);
    }

    // Check Popular Brands strip
    try {
      await page.waitForSelector('a[href*="brand="]', { timeout: 10000 });
    } catch {}
    const brandPills = await page.$$('a[href*="/search?brand="], a[href*="brand="]');
    console.log(`✓ Brand quick-filter pills found: ${brandPills.length} (Expected >= 10)`);
    if (brandPills.length < 10) {
      throw new Error(`Expected at least 10 brand pills, found ${brandPills.length}`);
    }

    // Check Live Multi-Store Deals section
    const dealCards = await page.$$('a[href*="/products/"]');
    console.log(`✓ Multi-Store product deal links on homepage: ${dealCards.length}`);

    await page.screenshot({ path: path.resolve(screenshotsDir, '6v-homepage.png') });
    console.log('✓ Captured 6v-homepage.png');

    // -------------------------------------------------------------
    // Test B: Product Detail Page (Zero Terra Fit Smart Watch)
    // -------------------------------------------------------------
    console.log('\n--- Testing Product Detail Page (unknown-zero-terra-fit-smart-watch) ---');
    const pdpSlug = 'unknown-zero-terra-fit-smart-watch';
    await page.goto(`http://localhost:${WEB_PORT}/products/${pdpSlug}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const pdpTitle = await page.title();
    console.log(`✓ PDP page title: "${pdpTitle}"`);

    const pdpBody = await page.textContent('body');

    // 1. Check Best Price is PriceOye @ Rs. 6,299
    const hasPriceOyeBest =
      pdpBody?.includes('6,299') || pdpBody?.includes('6299');
    console.log(`✓ PriceOye price (Rs. 6,299) present: ${hasPriceOyeBest ? '✓' : '❌'}`);
    if (!hasPriceOyeBest) throw new Error('Expected Best Price Rs. 6,299 on Zero Terra Fit PDP');

    // 2. Check Shophive offer @ Rs. 7,499
    const hasShophiveOffer =
      pdpBody?.includes('7,499') || pdpBody?.includes('7499');
    console.log(`✓ Shophive price (Rs. 7,499) present: ${hasShophiveOffer ? '✓' : '❌'}`);
    if (!hasShophiveOffer) throw new Error('Expected Shophive offer Rs. 7,499 on Zero Terra Fit PDP');

    // 3. Check CompareButton is present in header action bar
    const compareBtn = await page.$('button[aria-label*="ompare"], button:has-text("Compare")');
    console.log(`✓ CompareButton present: ${compareBtn ? '✓' : '❌'}`);
    if (!compareBtn) throw new Error('CompareButton not found in header action bar');

    // 4. Check Rich Specifications card
    const hasSpecifications =
      pdpBody?.includes('Specifications') || pdpBody?.includes('Key Features') || pdpBody?.includes('Specs');
    console.log(`✓ Specifications card present: ${hasSpecifications ? '✓' : '❌'}`);
    if (!hasSpecifications) throw new Error('Specifications card not found on PDP');

    // 5. Check Interactive Thumbnail strip
    const thumbnails = await page.$$('button:has(img[alt*="thumbnail"]), img[alt*="thumbnail"], button[aria-label*="Thumbnail"]');
    console.log(`✓ Interactive gallery thumbnails found: ${thumbnails.length}`);

    await page.screenshot({ path: path.resolve(screenshotsDir, '6v-pdp-zero-terra-fit.png') });
    console.log('✓ Captured 6v-pdp-zero-terra-fit.png');

    // -------------------------------------------------------------
    // Test C: Bank Offers Page (/bank-offers)
    // -------------------------------------------------------------
    console.log('\n--- Testing Bank Offers Page (/bank-offers) ---');
    await page.goto(`http://localhost:${WEB_PORT}/bank-offers`, { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('text=HBL', { timeout: 10000 });
    } catch {
      await page.waitForTimeout(2000);
    }
    const bankOffersBody = await page.textContent('body');

    const expectedBanks = ['HBL', 'Meezan', 'Bank Alfalah'];
    for (const bank of expectedBanks) {
      const found = bankOffersBody?.includes(bank);
      console.log(`   - Bank "${bank}" discount card: ${found ? '✓' : '❌'}`);
      if (!found) throw new Error(`Bank offer for "${bank}" not found on /bank-offers`);
    }

    await page.screenshot({ path: path.resolve(screenshotsDir, '6v-bank-offers.png') });
    console.log('✓ Captured 6v-bank-offers.png');

    // -------------------------------------------------------------
    // Test D: Coupons Page (/coupons)
    // -------------------------------------------------------------
    console.log('\n--- Testing Coupons Page (/coupons) ---');
    await page.goto(`http://localhost:${WEB_PORT}/coupons`, { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('text=PO500', { timeout: 10000 });
    } catch {
      await page.waitForTimeout(2000);
    }
    const couponsBody = await page.textContent('body');

    const expectedCoupons = ['PO500', 'APPFIRST', 'TMDEAL1000'];
    for (const code of expectedCoupons) {
      const found = couponsBody?.includes(code);
      console.log(`   - Coupon Code "${code}": ${found ? '✓' : '❌'}`);
      if (!found) throw new Error(`Coupon code "${code}" not found on /coupons`);
    }

    // Test Copy button
    const copyButton = await page.$('button:has-text("Copy")');
    if (copyButton) {
      await copyButton.click();
      console.log('✓ Clicked "Copy" button successfully');
    }

    await page.screenshot({ path: path.resolve(screenshotsDir, '6v-coupons.png') });
    console.log('✓ Captured 6v-coupons.png');

    // -------------------------------------------------------------
    // Test E: Contact & Price-Report Page (/contact)
    // -------------------------------------------------------------
    console.log('\n--- Testing Contact & Price-Report Form (/contact) ---');
    await page.goto(`http://localhost:${WEB_PORT}/contact`, { waitUntil: 'networkidle' });

    // Step 1: Trigger validation errors on empty submit
    const submitBtn = await page.$('button[type="submit"]');
    if (!submitBtn) throw new Error('Submit button not found on /contact');

    await submitBtn.click();
    await page.waitForTimeout(500);

    const validationErrors = await page.textContent('body');
    const hasNameError = validationErrors?.includes('at least 2 characters');
    const hasEmailError = validationErrors?.includes('valid email address');
    const hasMessageError = validationErrors?.includes('at least 10 characters');

    console.log(`✓ Validation triggers on empty submit:`);
    console.log(`   - Name error: ${hasNameError ? '✓' : '❌'}`);
    console.log(`   - Email error: ${hasEmailError ? '✓' : '❌'}`);
    console.log(`   - Message error: ${hasMessageError ? '✓' : '❌'}`);

    if (!hasNameError || !hasEmailError || !hasMessageError) {
      throw new Error('ContactForm validation errors failed to render as expected');
    }

    // Step 2: Fill out form with valid data
    await page.fill('#contact-name', 'Ali Khan');
    await page.fill('#contact-email', 'ali.khan@example.com');
    await page.selectOption('#contact-topic', 'price_report');
    await page.fill('#contact-product', 'PriceOye');
    await page.fill('#contact-message', 'Hello PakPrice team! Verifying the multi-store price matching accuracy on Zero Terra Fit Smart Watch. Everything looks fantastic.');

    // Step 3: Submit form
    await submitBtn.click();
    await page.waitForSelector('text=Message Received!', { timeout: 5000 });

    const successBody = await page.textContent('body');
    const hasTicketRef = successBody?.includes('PKP-');
    console.log(`✓ Contact form submission succeeded: "Message Received!"`);
    console.log(`✓ Generated ticket reference: ${hasTicketRef ? '✓' : '❌'}`);

    await page.screenshot({ path: path.resolve(screenshotsDir, '6v-contact-success.png') });
    console.log('✓ Captured 6v-contact-success.png');

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  🎉 ALL PLAYWRIGHT CHROMIUM E2E TESTS PASSED 100%!');
    console.log('════════════════════════════════════════════════════════════════\n');
  } finally {
    await browser.close();
    console.log('Shutting down API and Web test servers...');
    killProcessTree(apiProcess.pid);
    killProcessTree(webProcess.pid);
  }
}

main().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});

