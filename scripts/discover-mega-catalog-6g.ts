import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

async function discoverMegaUrls() {
  console.log('=== DISCOVERING CANDIDATE URLS FROM MEGA.PK ===\n');

  const categories = [
    { name: 'Mobiles', url: 'https://www.mega.pk/mobiles/' },
    { name: 'Laptops', url: 'https://www.mega.pk/laptop-price-pakistan/' },
    { name: 'Smartwatches', url: 'https://www.mega.pk/watches/' },
    { name: 'Tablets', url: 'https://www.mega.pk/tablets/' },
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  const discoveredUrls = new Set<string>();
  const candidates: { category: string; title: string; url: string; priceText: string }[] = [];

  for (const cat of categories) {
    console.log(`Harvesting ${cat.name} from ${cat.url}...`);
    try {
      const res = await axios.get(cat.url, { headers, timeout: 15000 });
      const $ = cheerio.load(res.data);

      $('a[href*="_products/"]').each((_, el) => {
        let href = $(el).attr('href');
        if (!href) return;
        if (!href.startsWith('http')) {
          href = `https://www.mega.pk${href.startsWith('/') ? '' : '/'}${href}`;
        }
        const title = $(el).text().trim() || $(el).attr('title') || '';
        // Extract price if nearby
        const parent = $(el).closest('.product, .col-xs-12, .col-sm-6, .col-md-4, .product-box, tr, div');
        const priceText = parent.find('.price, [itemprop="price"], .product_price, b:contains("PKR"), b:contains("Rs")').first().text().trim();

        if (href.endsWith('.html') && !discoveredUrls.has(href)) {
          discoveredUrls.add(href);
          candidates.push({
            category: cat.name,
            title: title || href.split('/').pop()?.replace('.html', '') || '',
            url: href,
            priceText,
          });
        }
      });
      console.log(`  Discovered ${candidates.length} unique candidates so far`);
    } catch (e: any) {
      console.error(`  Failed to fetch ${cat.url}: ${e.message}`);
    }
  }

  console.log(`\nTotal Unique Mega.pk Candidates Discovered: ${candidates.length}`);
  const outPath = path.resolve('scripts/mega-candidates-6g.json');
  fs.writeFileSync(outPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`Saved candidates list to ${outPath}`);

  for (const c of candidates.slice(0, 15)) {
    console.log(`  - [${c.category}] "${c.title}" -> ${c.url}`);
  }
}

discoverMegaUrls().catch(console.error);
