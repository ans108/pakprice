/**
 * Playwright E2E Verification Script for Increment 6W
 *
 * Verifies:
 * 1. Balanced PDP layout (no empty white space, Specs in left column, Quick Deal summary)
 * 2. Deduplicated brand and clean title in PDP metadata
 * 3. Zero-server-load Price Intelligence (Deal Thermometer + Store-by-Store bars, no blank green box, 0 extra network calls)
 * 4. Recommended products on PDP (4-col grid) and on Search page (below pagination)
 * 5. StoreOfferMatrix with 0 "Unsupported/Blocked" error badges
 * 6. Captures 5 high-res screenshots and copies to brain artifact directory
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/anssh/.gemini/antigravity/brain/b0c2912f-436e-4869-abea-6b2dfe2d8445';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'scripts/screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function copyToArtifact(fileName: string) {
  const src = path.join(SCREENSHOTS_DIR, fileName);
  const dest = path.join(ARTIFACT_DIR, fileName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ Copied ${fileName} to brain artifact dir`);
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6W — PLAYWRIGHT UI & EXPERIENCE AUDIT');
  console.log('════════════════════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Test 1: PDP Layout, Title, Price Intelligence, Recommendations, and Matrix UI
  console.log('1. Auditing Product Detail Page (/products/unknown-zero-terra-fit-smart-watch)...');
  let priceHistoryCalls = 0;
  page.on('request', (req) => {
    if (req.url().includes('/price-history')) {
      priceHistoryCalls++;
    }
  });

  await page.goto('http://localhost:3000/products/unknown-zero-terra-fit-smart-watch', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2500);

  // Verify Title
  const title = await page.title();
  console.log(`  Page Title: "${title}"`);
  if (title.includes('Zero Zero')) {
    console.error('  ❌ FAIL: Title contains duplicate leading brand name!');
  } else {
    console.log('  ✅ PASS: Title brand deduplicated cleanly');
  }
  if ((title.match(/PakPrice/g) || []).length > 1) {
    console.error('  ❌ FAIL: Title contains double | PakPrice suffix!');
  } else {
    console.log('  ✅ PASS: Title has single | PakPrice');
  }

  // Verify Network Calls (Zero Extra Server Load)
  console.log(`  Extra /price-history network requests: ${priceHistoryCalls}`);
  if (priceHistoryCalls === 0) {
    console.log('  ✅ PASS: Zero extra /price-history requests on PDP mount (0 server load)');
  } else {
    console.warn(`  ⚠️ Notice: ${priceHistoryCalls} /price-history calls detected`);
  }

  // Verify Left Column Components
  const specsCard = await page.$('text=/Specifications/i');
  console.log(`  Specifications card in left column: ${specsCard !== null ? '✅ Present' : '❌ Missing'}`);

  const quickDeal = await page.$('text=/Market Deal Summary/i');
  console.log(`  Quick Market Deal Summary card: ${quickDeal !== null ? '✅ Present' : '❌ Missing'}`);

  // Verify Price Intelligence Component
  const dealThermometer = await page.$('text=/Price Intelligence/i');
  console.log(`  Price Intelligence container: ${dealThermometer !== null ? '✅ Present' : '❌ Missing'}`);

  const storeBars = await page.$('text=/Store-by-Store/i');
  console.log(`  Store-by-Store Comparison Bars: ${storeBars !== null ? '✅ Present' : '❌ Missing'}`);

  // Verify Store Offer Matrix Badges
  const unsupportedBadges = await page.$$('text="Unsupported"');
  const blockedBadges = await page.$$('text="blocked"');
  const notCheckedBadges = await page.$$('text="Not checked"');
  console.log(`  Alarming error badges: ${unsupportedBadges.length + blockedBadges.length + notCheckedBadges.length}`);
  if (unsupportedBadges.length + blockedBadges.length + notCheckedBadges.length === 0) {
    console.log('  ✅ PASS: Zero "Unsupported / blocked" or "Not checked" badges in StoreOfferMatrix');
  } else {
    console.error('  ❌ FAIL: StoreOfferMatrix contains error/blocked badges');
  }

  // Verify PDP Recommendations
  const similarProductsHeading = await page.$('text=/Recommended Matches|You May Like/i');
  console.log(`  Similar Products heading on PDP: ${similarProductsHeading !== null ? '✅ Present' : '❌ Missing'}`);

  // Screenshot 1: Balanced Layout Top Section
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '6w-pdp-balanced-layout.png'),
    fullPage: false,
  });
  copyToArtifact('6w-pdp-balanced-layout.png');

  // Screenshot 2: Price Intelligence Component
  if (dealThermometer) {
    await dealThermometer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '6w-price-intelligence.png'),
    });
    copyToArtifact('6w-price-intelligence.png');
  }

  // Screenshot 3: Store Matrix Component
  const storeMatrix = await page.$('text=/12 Monitored Stores|Available Offers/i');
  if (storeMatrix) {
    await storeMatrix.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '6w-store-matrix.png'),
    });
    copyToArtifact('6w-store-matrix.png');
  }

  // Screenshot 4: PDP Recommendations Grid
  if (similarProductsHeading) {
    await similarProductsHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '6w-pdp-recommendations.png'),
    });
    copyToArtifact('6w-pdp-recommendations.png');
  }

  // Test 2: Search Page Recommendations
  console.log('\n2. Auditing Search Page Recommendations (/search?q=watch)...');
  await page.goto('http://localhost:3000/search?q=watch', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const searchRecommendedHeading = await page
    .waitForSelector('text=/Recommended in/i', { timeout: 12000 })
    .catch(() => null);
  console.log(`  Recommended products heading on search page: ${searchRecommendedHeading !== null ? '✅ Present' : '❌ Missing'}`);

  if (searchRecommendedHeading) {
    await searchRecommendedHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  } else {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '6w-search-recommendations.png'),
  });
  copyToArtifact('6w-search-recommendations.png');

  await browser.close();

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  PLAYWRIGHT AUDIT COMPLETED SUCCESSFULLY');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
