import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    console.log('Navigating to HomeShopping...');
    await page.goto('https://www.homeshopping.pk/categories/Mobile-Phones-Price-Pakistan/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Try selecting city
    try {
      const cityOption = page.locator('text=Lahore').first();
      if (await cityOption.isVisible()) {
        console.log('Clicking Lahore...');
        await cityOption.click();
        await page.waitForTimeout(1000);
        const doneBtn = page.locator('button:has-text("Done")').first();
        if (await doneBtn.isVisible()) {
          console.log('Clicking Done...');
          await doneBtn.click();
          await page.waitForTimeout(3000);
        }
      }
    } catch (e: any) {
      console.log('City modal handling note:', e.message);
    }

    // Now inspect product links and prices on the page
    const products = await page.evaluate(() => {
      const results: any[] = [];
      const links = document.querySelectorAll('a[href*="/products/"], a.vtex-product-summary-2-x-clearLink');
      links.forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        const text = (a as HTMLElement).innerText;
        results.push({ href, text });
      });
      return results;
    });

    console.log(`Found ${products.length} product links on HomeShopping:`);
    console.log(products.slice(0, 10));
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
