const cheerio = require('cheerio');

async function inspect() {
  const res = await fetch('https://www.daraz.pk/products/2-3-32-3000-i1968648084.html', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const jsonText = $('script[type="application/ld+json"]').first().html();
  const parsed = JSON.parse(jsonText);
  console.log('Offers in JSON-LD:', parsed.offers);

  const m = html.match(/var\s+__moduleData__\s*=\s*(\{[\s\S]*?\});\s*(?:var|<\/script>)/);
  if (m) {
    const data = JSON.parse(m[1]);
    const fields = data.data?.root?.fields || {};
    console.log('Keys in __moduleData__.data.root.fields:', Object.keys(fields));
    if (fields.skuGalleries) {
      console.log('skuGalleries:', JSON.stringify(fields.skuGalleries).substring(0, 300));
    }
    if (fields.productPrice) {
      console.log('productPrice:', JSON.stringify(fields.productPrice));
    }
    // Search for price anywhere in fields
    for (const [k, v] of Object.entries(fields)) {
      const s = JSON.stringify(v);
      if (s.includes('price') || s.includes('Price')) {
        console.log(`Field ${k} mentions price:`, s.substring(0, 200));
      }
    }
  }
}
inspect().catch(console.error);
