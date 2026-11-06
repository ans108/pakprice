import axios from 'axios';

const slugs = [
  'samsung-samsung-galaxy-watch-ultra-sm-l705f',
  'samsung-samsung-galaxy-watch-8-40mm',
  'unknown-apple-iphone-17-pro-max',
  'unknown-nasgas-50-liter-electric-storage-geyser-neg-505',
  'unknown-fresh-street-himalayan-pink-salt-onion-125g'
];

async function main() {
  console.log('=== PHASE 3: DATABASE-TO-API OFFERS ENDPOINT AUDIT ===\n');

  for (const slug of slugs) {
    const url = `http://127.0.0.1:4000/api/v1/products/${slug}/offers`;
    console.log(`\n-----------------------------------------------------`);
    console.log(`GET ${url}`);
    try {
      const res = await axios.get(url);
      console.log(`Status: ${res.status}`);
      const data = res.data;
      console.log(`Product Slug: ${data.product_slug}`);
      console.log(`Variant ID: ${data.variant_id} (${data.variant_name})`);
      console.log(`Store Count: ${data.store_count}, Has Multi Store: ${data.has_multi_store}, Lowest Price: PKR ${data.lowest_price}`);
      console.log(`Total Offers Returned: ${data.offers?.length || 0}`);

      if (data.offers) {
        for (const offer of data.offers) {
          console.log(`  - Store: ${offer.store?.name} (${offer.store?.slug})`);
          console.log(`    Price: PKR ${offer.price}, original: ${offer.original_price}, inStock: ${offer.in_stock}, status: ${offer.availability_status}`);
          console.log(`    URL: ${offer.product_url}`);
          console.log(`    Last Scraped: ${offer.last_scraped_at}`);
        }
      }
    } catch (err: any) {
      console.error(`API Error for ${slug}: ${err.message}`, err.response?.data || '');
    }
  }
}

main().catch(console.error);
