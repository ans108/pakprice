import axios from 'axios';
import * as cheerio from 'cheerio';

async function main() {
  const url = 'https://priceoye.pk/mobiles/samsung/samsung-galaxy-a07';
  console.log('Fetching', url, '...');
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 15000
  });

  console.log('Status:', res.status);
  const $ = cheerio.load(res.data);
  console.log('Title:', $('title').text().trim());
  console.log('h1:', $('h1').text().trim());

  console.log('\n--- PRICE SELECTORS ---');
  $('.summary-price').each((i, el) => {
    console.log(`summary-price [${i}]: class="${$(el).attr('class')}" text="${$(el).text().trim()}"`);
  });

  $('.price-box').each((i, el) => {
    console.log(`price-box [${i}]: text="${$(el).text().trim()}"`);
  });

  $('.price-diff').each((i, el) => {
    console.log(`price-diff [${i}]: text="${$(el).text().trim()}"`);
  });

  // Check specs / breadcrumbs / model / brand
  console.log('\n--- BREADCRUMBS ---');
  $('.breadcrumb li, .breadcrumbs li, ol.breadcrumb li').each((i, el) => {
    console.log(`breadcrumb [${i}]: "${$(el).text().trim()}"`);
  });

  // Check product-id
  console.log('hidden inputs / product id:');
  $('input[type="hidden"]').each((i, el) => {
    const name = $(el).attr('name') || '';
    if (name.includes('id') || name.includes('product')) {
      console.log(`  ${name} = ${$(el).val()}`);
    }
  });

  // Check JSON-LD
  console.log('\n--- JSON-LD ---');
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      if (json['@type'] === 'Product' || json['name']) {
        console.log('Product JSON-LD:', JSON.stringify(json, null, 2).slice(0, 500));
      }
    } catch {}
  });
}

main().catch(console.error);
