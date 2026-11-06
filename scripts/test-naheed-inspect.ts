import axios from 'axios';
import * as cheerio from 'cheerio';

async function inspectNaheedCategory() {
  const catRes = await axios.get('https://www.naheed.pk/groceries-pets', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });
  const $ = cheerio.load(catRes.data);
  console.log('Category Title:', $('title').text().trim());

  const items: any[] = [];
  $('.product-item').slice(0, 5).each((i, el) => {
    const $el = $(el);
    const title = $el.find('.product-item-link, a.product-item-photo, .product.name a').text().trim() ||
                  $el.find('img').attr('alt') ||
                  $el.find('a').attr('title');
    const href = $el.find('.product-item-link, a.product-item-photo').attr('href') ||
                 $el.find('a').attr('href');
    const priceText = $el.find('[data-price-type="finalPrice"] .price, .price-wrapper .price, .price').first().text().trim();
    const oldPriceText = $el.find('[data-price-type="oldPrice"] .price, .old-price .price').first().text().trim();
    const img = $el.find('img.product-image-photo, img').attr('src') || $el.find('img').attr('data-src');

    items.push({ title, href, priceText, oldPriceText, img });
  });

  console.log('Parsed Products Sample:', JSON.stringify(items, null, 2));

  // Let's also test a direct PDP from one of these items
  if (items[0]?.href) {
    console.log('\n--- Fetching direct PDP from Naheed:', items[0].href);
    const pdpRes = await axios.get(items[0].href, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });
    const $pdp = cheerio.load(pdpRes.data);
    console.log('PDP Title:', $pdp('h1.page-title, h1').text().trim());
    console.log('PDP Price:', $pdp('[data-price-type="finalPrice"] .price, .price-wrapper .price, span.price').first().text().trim());
    console.log('PDP SKU:', $pdp('.product.attribute.sku .value, [itemprop="sku"]').text().trim());
    console.log('PDP Stock:', $pdp('.stock.available, .stock.unavailable').text().trim());
    console.log('PDP Schema.org LD-JSON exists:', $pdp('script[type="application/ld+json"]').length > 0);
    if ($pdp('script[type="application/ld+json"]').length > 0) {
      $pdp('script[type="application/ld+json"]').each((_, s) => {
        try {
          const json = JSON.parse($pdp(s).html() || '{}');
          if (json['@type'] === 'Product' || json.name || json.offers) {
            console.log('Product JSON-LD found:', {
              name: json.name,
              sku: json.sku,
              price: json.offers?.price || json.offers?.[0]?.price,
              availability: json.offers?.availability || json.offers?.[0]?.availability,
            });
          }
        } catch {}
      });
    }
  }
}

inspectNaheedCategory();
