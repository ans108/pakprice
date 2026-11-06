import axios from 'axios';

async function main() {
  const res = await axios.get('http://localhost:4000/api/v1/products/samsung-samsung-galaxy-watch-ultra-sm-l705f');
  console.log('Product:', res.data.data.name);
  const variants = res.data.data.variants || [];
  for (const v of variants) {
    console.log('Variant:', v.name);
    console.log('Offers count:', (v.prices || []).length);
    for (const p of v.prices || []) {
      console.log(` - Store: ${p.store?.name} (${p.store?.slug}), Price: Rs. ${p.price.toLocaleString()}, InStock: ${p.inStock}`);
    }
  }
}

main().catch(console.error);
