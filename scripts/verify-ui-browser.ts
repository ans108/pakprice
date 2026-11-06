/**
 * Increment 6Q — Real Browser UI Verification with Playwright
 *
 * Launches Chromium via Playwright to verify the live rendered UI on http://localhost:3000
 * for:
 * Phase 1 (5 products from Increment 6P):
 *  1. Audionic Spark Pro S-200 (Telemart Rs. 4,499)
 *  2. Infinix XW3GT Smart Watch (Shophive Rs. 5,099)
 *  3. Zero Ignite Smart Watch (Shophive Rs. 5,999)
 *  4. Zero Luna Smart Watch (Shophive Rs. 5,999)
 *  5. Zero Visionary Smartwatch (Shophive Rs. 13,999)
 *
 * Phase 5 (2 products from Increment 6Q):
 *  6. Google Pixel Watch 2 (PriceOye Rs. 70,449)
 *  7. Infinix Hot 60 Pro 8GB 128GB (Telemart Rs. 66,949, PriceOye Rs. 66,999)
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const localScreenshotDir = path.resolve(process.cwd(), 'scripts/screenshots');

if (!fs.existsSync(localScreenshotDir)) {
  fs.mkdirSync(localScreenshotDir, { recursive: true });
}

interface ProductCheck {
  phase: string;
  name: string;
  slug: string;
  expectedOffers: Array<{
    storeSlug: string;
    expectedPriceText: string;
  }>;
}

const productsToVerify: ProductCheck[] = [
  // Phase 1 — 6P Products
  {
    phase: 'Phase 1 (6P)',
    name: 'Audionic Spark Pro S-200',
    slug: 'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
    expectedOffers: [
      { storeSlug: 'telemart', expectedPriceText: '4,499' },
    ],
  },
  {
    phase: 'Phase 1 (6P)',
    name: 'Infinix XW3GT Smart Watch',
    slug: 'unknown-infinix-xw3gt-smart-watch',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '5,099' },
    ],
  },
  {
    phase: 'Phase 1 (6P)',
    name: 'Zero Ignite Smart Watch',
    slug: 'unknown-zero-ignite-smart-watch',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '5,999' },
    ],
  },
  {
    phase: 'Phase 1 (6P)',
    name: 'Zero Luna Smart Watch',
    slug: 'unknown-zero-luna-smart-watch',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '5,999' },
    ],
  },
  {
    phase: 'Phase 1 (6P)',
    name: 'Zero Visionary Smartwatch',
    slug: 'unknown-zero-visionary-smartwatch',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '13,999' },
    ],
  },
  // Phase 5 — 6Q Products
  {
    phase: 'Phase 5 (6Q)',
    name: 'Google Pixel Watch 2',
    slug: 'google-google-pixel-watch-2',
    expectedOffers: [
      { storeSlug: 'priceoye', expectedPriceText: '70,449' },
    ],
  },
  {
    phase: 'Phase 5 (6Q)',
    name: 'Infinix Hot 60 Pro 8GB 128GB',
    slug: 'infinix-infinix-hot-60-pro-8gb-128gb',
    expectedOffers: [
      { storeSlug: 'telemart', expectedPriceText: '66,949' },
      { storeSlug: 'priceoye', expectedPriceText: '66,999' },
    ],
  },
];

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  STARTING PLAYWRIGHT REAL BROWSER UI VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════');

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PakPrice-Verification',
  });

  const page = await context.newPage();
  const results: any[] = [];
  let allPassed = true;

  for (let i = 0; i < productsToVerify.length; i++) {
    const item = productsToVerify[i];
    const url = `http://localhost:3000/products/${item.slug}`;
    console.log(`\n[${i + 1}/${productsToVerify.length}] Testing ${item.phase}: ${item.name}`);
    console.log(`  URL: ${url}`);

    const imageErrors: string[] = [];
    const handleResponse = (response: any) => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) {
        imageErrors.push(`${response.status()} on ${response.url()}`);
      }
    };
    page.on('response', handleResponse);

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const status = response ? response.status() : 0;
      console.log(`  HTTP Status: ${status}`);

      if (status !== 200) {
        console.error(`  ❌ Page failed to load with status ${status}`);
        allPassed = false;
        results.push({ ...item, status, success: false, error: `HTTP ${status}` });
        page.off('response', handleResponse);
        continue;
      }

      // Wait for H1 heading to appear
      await page.waitForSelector('h1', { timeout: 25000 });
      // Brief wait for hydration
      await page.waitForTimeout(2000);

      // Check product title in DOM
      const titleElem = await page.$('h1');
      const renderedTitle = titleElem ? (await titleElem.innerText()).trim() : '';
      console.log(`  Rendered H1: "${renderedTitle}"`);

      // Screenshot
      const screenshotName = `${item.slug.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      const localPath = path.join(localScreenshotDir, screenshotName);
      await page.screenshot({ path: localPath, fullPage: true });
      console.log(`  Screenshot saved: ${localPath}`);

      // Inspect full page text for store and price presence
      const pageContent = await page.content();
      const bodyText = await page.innerText('body');

      const offersFound: any[] = [];
      let itemOffersPassed = true;

      for (const exp of item.expectedOffers) {
        // Look for store text case-insensitively
        const hasStore = new RegExp(exp.storeSlug, 'i').test(bodyText) || new RegExp(exp.storeSlug, 'i').test(pageContent);
        // Look for price string (e.g. "4,499" or "4499")
        const priceRegex = new RegExp(exp.expectedPriceText.replace(',', ',?'), 'i');
        const hasPrice = priceRegex.test(bodyText) || priceRegex.test(pageContent);

        console.log(`  • Store [${exp.storeSlug}]: found=${hasStore}, Price [${exp.expectedPriceText}]: found=${hasPrice}`);

        if (!hasStore || !hasPrice) {
          itemOffersPassed = false;
          allPassed = false;
        }

        offersFound.push({
          store: exp.storeSlug,
          expectedPrice: exp.expectedPriceText,
          hasStore,
          hasPrice,
          passed: hasStore && hasPrice,
        });
      }

      // Check external store links
      const links = await page.$$eval('a[href^="http"]', (anchors) =>
        anchors.map((a) => a.getAttribute('href') || '')
      );
      const storeLinks = links.filter((h) =>
        h.includes('telemart.pk') ||
        h.includes('shophive.com') ||
        h.includes('priceoye.pk') ||
        h.includes('mega.pk')
      );
      console.log(`  External Store Outbound Links Found: ${storeLinks.length}`);
      for (const sl of storeLinks.slice(0, 4)) {
        console.log(`    -> ${sl}`);
      }

      console.log(`  Image Load Failures: ${imageErrors.length}`);
      if (imageErrors.length > 0) {
        console.warn(`    ⚠ Broken images:`, imageErrors);
      }

      const success = renderedTitle.length > 0 && itemOffersPassed && imageErrors.length === 0;
      console.log(`  Result: ${success ? '✅ PASSED' : '❌ FAILED'}`);

      results.push({
        name: item.name,
        slug: item.slug,
        phase: item.phase,
        renderedTitle,
        offersFound,
        outboundLinksCount: storeLinks.length,
        imageErrorsCount: imageErrors.length,
        success,
      });
    } catch (err: any) {
      console.error(`  ❌ Error verifying ${item.name}: ${err.message}`);
      allPassed = false;
      results.push({ ...item, success: false, error: err.message });
    } finally {
      page.off('response', handleResponse);
    }
  }

  await browser.close();

  // Save report
  const reportPath = path.resolve(process.cwd(), 'scripts/browser_ui_verification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), allPassed, results }, null, 2));

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  BROWSER UI VERIFICATION SUMMARY: ${allPassed ? '🎉 ALL 7 PRODUCTS PASSED' : '❌ SOME PRODUCTS FAILED'}`);
  console.log(`  Detailed report saved to: ${path.basename(reportPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(console.error);
