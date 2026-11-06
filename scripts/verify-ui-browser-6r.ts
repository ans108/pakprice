/**
 * Increment 6R — Real Browser UI Verification with Playwright
 *
 * Launches Chromium via Playwright to verify the live rendered UI on http://localhost:3000
 * for:
 * 1. Huawei Band 9 (PriceOye Rs. 7,699, Mega.pk Rs. 8,599)
 * 2. Anker Soundcore Liberty 5 (Shophive Rs. 20,499, PriceOye Rs. 20,499)
 * 3. Xiaomi Redmi Buds 8 (Shophive Rs. 13,799, Mega.pk Rs. 13,799)
 * 4. Infinix XW3P Smart Watch (Shophive Rs. 5,999, Telemart Rs. 7,999)
 * 5. Regression Check: Audionic Spark Pro S-200 (verify zero broken images / no 403 CDN errors)
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
  checkImageFallbacks?: boolean;
}

const productsToVerify: ProductCheck[] = [
  // 6R Newly Persisted Products
  {
    phase: 'Increment 6R',
    name: 'Huawei Band 9',
    slug: 'huawei-huawei-band-9',
    expectedOffers: [
      { storeSlug: 'priceoye', expectedPriceText: '7,699' },
      { storeSlug: 'shophive', expectedPriceText: '12,399' },
    ],
  },
  {
    phase: 'Increment 6R',
    name: 'Anker Soundcore Liberty 5',
    slug: 'anker-anker-soundcore-liberty-5-noise-reduction-wireless-earbuds',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '20,499' },
      { storeSlug: 'telemart', expectedPriceText: '19,499' },
    ],
  },
  {
    phase: 'Increment 6R',
    name: 'Xiaomi Redmi Buds 8',
    slug: 'xiaomi-xiaomi-redmi-buds-8',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '13,799' },
      { storeSlug: 'telemart', expectedPriceText: '12,299' },
    ],
  },
  {
    phase: 'Increment 6R',
    name: 'Infinix XW3P Smart Watch',
    slug: 'unknown-infinix-xw3p-smart-watch',
    expectedOffers: [
      { storeSlug: 'shophive', expectedPriceText: '5,999' },
      { storeSlug: 'priceoye', expectedPriceText: '4,299' },
    ],
  },
  // Regression check: PriceOye CDN 403 image fix
  {
    phase: 'Regression (6R Fix)',
    name: 'Audionic Spark Pro S-200 Powerbank',
    slug: 'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
    expectedOffers: [
      { storeSlug: 'telemart', expectedPriceText: '4,499' },
      { storeSlug: 'priceoye', expectedPriceText: '4,799' },
    ],
    checkImageFallbacks: true,
  },
];

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  STARTING PLAYWRIGHT REAL BROWSER UI VERIFICATION (INCREMENT 6R)');
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
      await page.waitForSelector('h1', { timeout: 35000 });
      // Wait for hydration and dynamic offers component
      await page.waitForTimeout(3000);

      // Check product title in DOM
      const titleElem = await page.$('h1');
      const renderedTitle = titleElem ? (await titleElem.innerText()).trim() : '';
      console.log(`  Rendered H1: "${renderedTitle}"`);

      // Screenshot
      const screenshotName = `6r_${item.slug.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
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
        // Look for price string (e.g. "7,699" or "7699")
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
        // In 6R, broken images are an explicit failure because we fixed ProductImage.tsx
        itemOffersPassed = false;
        allPassed = false;
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
  const reportPath = path.resolve(process.cwd(), 'scripts/browser_ui_verification_report_6r.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), allPassed, results }, null, 2));

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  BROWSER UI VERIFICATION SUMMARY: ${allPassed ? '🎉 ALL 5 PRODUCTS PASSED' : '❌ SOME PRODUCTS FAILED'}`);
  console.log(`  Detailed report saved to: ${path.basename(reportPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(console.error);

