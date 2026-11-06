/**
 * Increment 6P — Test Approved Candidate PDPs Live
 *
 * Verifies live HTTP extraction for the 5 approved candidates:
 * 1. Telemart: Audionic Spark Pro S-200 Power Bank 20000mAh
 * 2. Shophive: Infinix XW3GT Smart Watch
 * 3. Shophive: Zero Ignite Smart Watch
 * 4. Shophive: Zero Luna Smartwatch
 * 5. Shophive: Zero Visionary Smart Watch
 */
import axios from 'axios';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';

async function main() {
  console.log('Testing live extraction for 5 approved candidates...\n');

  const telemart = new TelemartScraper();
  const shophive = new ShophiveScraper();

  const candidates = [
    {
      store: 'telemart',
      extract: (html: string, url: string) => telemart.extractFromHtml(html, url),
      name: 'Audionic Spark Pro S-200 Power Bank 20000mAh',
      url: 'https://www.telemart.pk/products/audionic-spark-pro-s-200-power-bank-20000mah?_pos=1&_psq=Audionic+Spark+Pro+S-200&_psid=d76c63e4a&_ss=e'
    },
    {
      store: 'shophive',
      extract: (html: string, url: string) => shophive.extractProductFromHtml(html, url, 'smart-watches'),
      name: 'Infinix XW3GT Smart Watch',
      url: 'https://www.shophive.com/infinix-xw3gt-smart-watch/'
    },
    {
      store: 'shophive',
      extract: (html: string, url: string) => shophive.extractProductFromHtml(html, url, 'smart-watches'),
      name: 'Zero Ignite Smart Watch',
      url: 'https://www.shophive.com/zero-ignite-smart-watch/'
    },
    {
      store: 'shophive',
      extract: (html: string, url: string) => shophive.extractProductFromHtml(html, url, 'smart-watches'),
      name: 'Zero Luna Smart Watch',
      url: 'https://www.shophive.com/zero-luna-smartwatch/'
    },
    {
      store: 'shophive',
      extract: (html: string, url: string) => shophive.extractProductFromHtml(html, url, 'smart-watches'),
      name: 'Zero Visionary Smart Watch',
      url: 'https://www.shophive.com/zero-visionary-smart-watch/'
    }
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    console.log(`[${i + 1}/${candidates.length}] Testing ${c.store}: ${c.name}`);
    console.log(`  URL: ${c.url}`);
    try {
      const res = await axios.get(c.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      });

      const scraped = c.extract(res.data, c.url);
      if (!scraped) {
        console.log('  ❌ Extraction returned null');
      } else {
        console.log(`  ✓ Title extracted   : ${scraped.name}`);
        console.log(`  ✓ Price extracted   : Rs. ${scraped.price}`);
        console.log(`  ✓ In Stock          : ${scraped.inStock}`);
        console.log(`  ✓ Image URL         : ${scraped.imageUrl ? scraped.imageUrl.substring(0, 60) + '...' : 'none'}`);
        console.log(`  ✓ Identifier        : ${scraped.sourceIdentifier} (${scraped.sourceIdentifierType})`);
      }
    } catch (err: any) {
      console.error(`  ❌ Failed to extract: ${err.message}`);
    }
    console.log();
  }
}

main().catch(console.error);
