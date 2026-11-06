import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

async function discoverShophiveUrls() {
  console.log('=== DISCOVERING CANDIDATE URLS FROM SHOPHIVE ===\n');

  const categories = [
    { name: 'Mobiles', url: 'https://www.shophive.com/mobile-phones', categorySlug: 'mobiles' },
    { name: 'Laptops', url: 'https://www.shophive.com/laptops', categorySlug: 'laptops' },
    { name: 'Smartwatches', url: 'https://www.shophive.com/smart-watches', categorySlug: 'smart-watches' },
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  const discoveredUrls = new Set<string>();
  const candidates: { category: string; categorySlug: string; title: string; url: string }[] = [];

  for (const cat of categories) {
    console.log(`Harvesting ${cat.name} from ${cat.url}...`);
    try {
      // Check page 1 and page 2
      for (const p of [1, 2]) {
        const pageUrl = p === 1 ? cat.url : `${cat.url}?p=${p}`;
        const res = await axios.get(pageUrl, { headers, timeout: 15000 });
        const $ = cheerio.load(res.data);

        $('a.product-item-link, a.product-item-photo, ol.products li a.product-item-link').each((_, el) => {
          let href = $(el).attr('href');
          if (!href) return;
          if (!href.startsWith('http')) {
            href = `https://www.shophive.com${href.startsWith('/') ? '' : '/'}${href}`;
          }
          const title = $(el).attr('title') || $(el).text().trim() || '';

          if (
            href.includes('shophive.com') &&
            !href.includes('/checkout/') &&
            !href.includes('/customer/') &&
            !href.includes('/wishlist/') &&
            !href.includes('/contact') &&
            !discoveredUrls.has(href)
          ) {
            discoveredUrls.add(href);
            candidates.push({
              category: cat.name,
              categorySlug: cat.categorySlug,
              title: title || href.split('/').filter(Boolean).pop()?.replace('.html', '') || '',
              url: href,
            });
          }
        });
      }
      console.log(`  Discovered ${candidates.length} unique candidates so far`);
    } catch (e: any) {
      console.error(`  Failed to fetch ${cat.url}: ${e.message}`);
    }
  }

  console.log(`\nTotal Unique Shophive Candidates Discovered: ${candidates.length}`);
  const outPath = path.resolve('scripts/shophive-candidates-6g.json');
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`Saved candidates list to ${outPath}`);

  for (const c of candidates.slice(0, 15)) {
    console.log(`  - [${c.category}] "${c.title}" -> ${c.url}`);
  }
}

discoverShophiveUrls().catch(console.error);
