import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testHsAndAl() {
  const query = 'Samsung Galaxy A05';

  const hsRes = await axios.get(`https://homeshopping.pk/api/catalog_system/pub/products/search/${encodeURIComponent(query)}?_from=0&_to=2`, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 8000,
    validateStatus: () => true
  });
  console.log('HS data length:', Array.isArray(hsRes.data) ? hsRes.data.length : 'not array');
  if (Array.isArray(hsRes.data) && hsRes.data.length > 0) {
    console.log('HS 0:', {
      productName: hsRes.data[0].productName,
      link: hsRes.data[0].link,
      items: hsRes.data[0].items?.map((it: any) => ({
        name: it.name,
        sellers: it.sellers?.map((s: any) => ({
          name: s.sellerName,
          price: s.commertialOffer?.Price,
          avail: s.commertialOffer?.AvailableQuantity
        }))
      }))
    });
  }

  const alRes = await axios.get(`https://alfatah.com.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 8000,
    validateStatus: () => true
  });
  console.log('Al-Fatah keys:', Object.keys(alRes.data || {}));
  console.log('Al-Fatah products:', alRes.data?.resources?.results?.products);
}

testHsAndAl();

