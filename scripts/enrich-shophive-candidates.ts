import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

async function enrichShophiveCandidates() {
  const existingPath = path.resolve('scripts/shophive-candidates-6g.json');
  let candidates: { category: string; categorySlug: string; title: string; url: string }[] = [];
  if (fs.existsSync(existingPath)) {
    candidates = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  }

  const seenUrls = new Set(candidates.map((c) => c.url));

  const targetUrls = [
    { cat: 'Mobiles', slug: 'mobiles', url: 'https://www.shophive.com/mobile-phones/apple' },
    { cat: 'Mobiles', slug: 'mobiles', url: 'https://www.shophive.com/mobile-phones/samsung' },
    { cat: 'Mobiles', slug: 'mobiles', url: 'https://www.shophive.com/mobile-phones/xiaomi' },
    { cat: 'Mobiles', slug: 'mobiles', url: 'https://www.shophive.com/apple/iphone' },
    { cat: 'Mobiles', slug: 'mobiles', url: 'https://www.shophive.com/apple/apple-watch' },
    { cat: 'Smartwatches', slug: 'smart-watches', url: 'https://www.shophive.com/smart-watches?p=3' },
    { cat: 'Smartwatches', slug: 'smart-watches', url: 'https://www.shophive.com/smart-watches?p=4' },
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  for (const target of targetUrls) {
    try {
      console.log(`Checking ${target.url}...`);
      const res = await axios.get(target.url, { headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      let found = 0;
      $('a.product-item-link, a.product-item-photo').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (!href.startsWith('http')) {
          href = `https://www.shophive.com${href.startsWith('/') ? '' : '/'}${href}`;
        }
        if (
          href.includes('shophive.com') &&
          !href.includes('/checkout/') &&
          !href.includes('/customer/') &&
          !href.includes('/wishlist/') &&
          !href.includes('/contact') &&
          !seenUrls.has(href)
        ) {
          seenUrls.add(href);
          candidates.push({
            category: target.cat,
            categorySlug: target.slug,
            title: href.split('/').filter(Boolean).pop()?.replace('.html', '') || '',
            url: href,
          });
          found++;
        }
      });
      console.log(`  Added ${found} new items. Total candidates: ${candidates.length}`);
    } catch (e: any) {
      console.log(`  Skipped ${target.url} (${e.message})`);
    }
  }

  fs.writeFileSync(existingPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`Saved enriched candidates (${candidates.length} total) to ${existingPath}`);
}

enrichShophiveCandidates().catch(console.error);
