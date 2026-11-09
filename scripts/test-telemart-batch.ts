import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testTelemartBatch() {
  const products = [
    'Samsung Galaxy A07',
    'Audionic Airbud 690',
    'Audionic Airbud 730',
    'Zero Terra Fit',
    'Kieslect Kr',
    'Infinix Smart 20'
  ];

  for (const p of products) {
    try {
      const url = `https://www.telemart.pk/search/suggest.json?q=${encodeURIComponent(p)}&resources[type]=product`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 5000,
        validateStatus: () => true
      });
      if (res.status === 200 && res.data?.resources?.results?.products) {
        console.log(`[Telemart] Query: "${p}" -> ${res.data.resources.results.products.length} matches`);
        for (const item of res.data.resources.results.products.slice(0, 2)) {
          console.log(`   - ${item.title} | Price: ${item.price} | URL: ${item.url}`);
        }
      } else {
        console.log(`[Telemart] Query: "${p}" -> No products found (Status ${res.status})`);
      }
    } catch (e: any) {
      console.log(`[Telemart] Query: "${p}" -> Error: ${e.message}`);
    }
  }
}

testTelemartBatch();

