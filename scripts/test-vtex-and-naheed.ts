import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testVTEX() {
  console.log('=== Testing HomeShopping VTEX Endpoints ===');
  const testUrls = [
    'https://homeshopping.pk/api/catalog_system/pub/products/search?_from=0&_to=10',
    'https://homeshopping.pk/api/catalog_system/pub/products/search/samsung?_from=0&_to=5',
    'https://homeshopping.pk/api/catalog_system/pub/products/search/mobile-phones?_from=0&_to=5',
    'https://homeshopping.pk/_v/segment/graphql/v1',
  ];

  for (const u of testUrls) {
    try {
      const res = await axios.get(u, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 10000,
        validateStatus: () => true,
      });
      console.log(`URL: ${u} -> Status: ${res.status}`);
      if (res.status === 200) {
        if (Array.isArray(res.data)) {
          console.log(`Found ${res.data.length} products via VTEX API!`);
          if (res.data.length > 0) {
            const first = res.data[0];
            console.log('Sample Product:', {
              productId: first.productId,
              productName: first.productName,
              linkText: first.linkText,
              link: first.link,
              brand: first.brand,
              itemsCount: first.items?.length,
              skuId: first.items?.[0]?.itemId,
              sellers: first.items?.[0]?.sellers?.map((s: any) => ({
                sellerName: s.sellerName,
                price: s.commertialOffer?.Price,
                listPrice: s.commertialOffer?.ListPrice,
                availableQuantity: s.commertialOffer?.AvailableQuantity,
              })),
            });
          }
        } else {
          console.log('Data preview:', typeof res.data, JSON.stringify(res.data).slice(0, 150));
        }
      }
    } catch (err: any) {
      console.log(`Error on ${u}: ${err.message}`);
    }
  }
}

async function testNaheed() {
  console.log('\n=== Testing Naheed Endpoints ===');
  try {
    const res = await axios.get('https://www.naheed.pk/catalogsearch/result/?q=tea', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    console.log(`Naheed search status: ${res.status}, length: ${res.data.length}`);
    const $ = cheerio.load(res.data);
    const productItems: any[] = [];
    $('.product-item, .item.product').each((_, el) => {
      const name = $(el).find('.product-item-link').text().trim();
      const href = $(el).find('.product-item-link').attr('href');
      const priceText = $(el).find('.price').first().text().trim();
      if (name && href) {
        productItems.push({ name, href, priceText });
      }
    });
    console.log(`Parsed ${productItems.length} product items from Naheed HTML!`);
    console.log('Samples:', productItems.slice(0, 3));
  } catch (err: any) {
    console.log(`Naheed error: ${err.message}`);
  }
}

async function main() {
  await testVTEX();
  await testNaheed();
}

main();
