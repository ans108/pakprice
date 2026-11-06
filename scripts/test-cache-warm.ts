import axios from 'axios';

async function main() {
  const query = 'iPhone 17 Pro Max';
  console.log(`Testing query "${query}" twice in a row:`);
  
  const t0 = performance.now();
  const res1 = await axios.get(`http://localhost:4000/api/v1/search?q=${encodeURIComponent(query)}`);
  const dur1 = Math.round(performance.now() - t0);
  console.log(`Call 1: ${dur1}ms | status: ${res1.status} | total: ${res1.data.pagination.total}`);

  const t1 = performance.now();
  const res2 = await axios.get(`http://localhost:4000/api/v1/search?q=${encodeURIComponent(query)}`);
  const dur2 = Math.round(performance.now() - t1);
  console.log(`Call 2 (cached): ${dur2}ms | status: ${res2.status} | total: ${res2.data.pagination.total}`);
}

main().catch(console.error);
