import axios from 'axios';

async function main() {
  const specificQueries = [
    'iPhone 17 Pro Max',
    'Galaxy Watch 8',
    'HP Laptop',
    'Samsung Galaxy A07',
    'Apple iPhone 17',
    'iPhone 17',
    'Samsung Watch',
    'iphone',
    'samsung',
    'vivo',
    'oppo',
    'xiaomi',
    'galaxy watch',
    'laptop',
    'smartwatch'
  ];

  console.log('--- Testing Query Counts & Latencies ---');
  for (const q of specificQueries) {
    const t0 = performance.now();
    try {
      const res = await axios.get(`http://localhost:4000/api/v1/search`, {
        params: { q },
        timeout: 10000,
      });
      const dur = Math.round(performance.now() - t0);
      const data = res.data;
      console.log(`Query: "${q}" | Total: ${data.pagination?.total} | Returned: ${data.data?.length} | ${dur}ms`);
      if (data.data?.length > 0 && data.data?.length <= 3) {
        console.log(`   Items (${data.data.length}): ${data.data.map((p: any) => p.name).join(' | ')}`);
      }
    } catch (e: any) {
      console.error(`Query "${q}" failed:`, e.message);
    }
  }
}

main().catch(console.error);
