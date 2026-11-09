import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testStores() {
  const query = 'Samsung Galaxy A05';

  // 1. Telemart
  try {
    const res = await axios.get(`https://www.telemart.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
      validateStatus: () => true
    });
    console.log('Telemart status:', res.status);
    if (res.status === 200 && res.data?.resources?.results?.products) {
      console.log('Telemart products sample:', res.data.resources.results.products.slice(0, 2).map((p: any) => ({ title: p.title, url: p.url, price: p.price })));
    }
  } catch (e: any) {
    console.log('Telemart error:', e.message);
  }

  // 2. HomeShopping
  try {
    const res = await axios.get(`https://homeshopping.pk/api/catalog_system/pub/products/search/${encodeURIComponent(query)}?_from=0&_to=3`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
      validateStatus: () => true
    });
    console.log('HomeShopping status:', res.status);
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log('HomeShopping sample:', res.data.slice(0, 2).map((p: any) => ({
        productName: p.productName,
        link: p.link,
        price: p.items?.[0]?.sellers?.[0]?.commertialOffer?.Price
      })));
    }
  } catch (e: any) {
    console.log('HomeShopping error:', e.message);
  }

  // 3. Al-Fatah
  try {
    const res = await axios.get(`https://alfatah.com.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000,
      validateStatus: () => true
    });
    console.log('Al-Fatah status:', res.status);
    if (res.status === 200 && res.data?.resources?.results?.products) {
      console.log('Al-Fatah sample:', res.data.resources.results.products.slice(0, 2).map((p: any) => ({ title: p.title, url: p.url, price: p.price })));
    }
  } catch (e: any) {
    console.log('Al-Fatah error:', e.message);
  }
}

testStores();

